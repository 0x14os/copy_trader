const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const FeeMarketEIP1559Transaction = require('@ethereumjs/tx').FeeMarketEIP1559Transaction
const Transaction = require('@ethereumjs/tx').Transaction;
const Common = require('@ethereumjs/common').default;
const ethers = require('ethers');
const Web3 = require('web3');
const chalk = require('chalk');
const WebSocket = require('ws');
const fs = require('fs');
const InputDataDecoder = require('./input_data_decoder');
const config = require('./config');
const { toUSVString } = require("util");
const path = require("path");
const { resolveObjectURL } = require("buffer");
const { decode } = require("punycode");
const { error } = require("console");


const provider = new ethers.providers.JsonRpcProvider(config.alchemy_rpc.https);
const web3 = createAlchemyWeb3(config.alchemy_rpc.wss);
const erc20abi = JSON.parse(fs.readFileSync('./abi/abi_erc20.json'));
const quoterabi = JSON.parse(fs.readFileSync('./abi/quoter.json'));
let decoder = [];
let contracts = [];
let TxDataArray = [];

const loadDecodersFromABI = () => {
	console.log(chalk.yellow("Loading ABIs..."));
	
	config.to_contractAddr_abi.forEach(data => {
		decoder[data.address] = new InputDataDecoder(`./abi/${data.abiFileName}`);
	})
	
	console.log(chalk.green("All ABIs has loaded successfully!"));
}

const loadContracts = () => {
	console.log(chalk.yellow("Loading Contracts..."));
	
	config.to_contractAddr_abi.forEach(data => {
		const abi = JSON.parse(fs.readFileSync(`./abi/${data.abiFileName}`));
		contracts[data.address] = new web3.eth.Contract(abi, data.address);
	})

	console.log(chalk.green("All contracts has loaded successfully!"));
}

const startCopyTrading = () => {
	const wss = new WebSocket(
		config.rpc.wss, {
			headers: {
				"Authorization": bxAuthHeader
			},
			rejectUnauthorized: false,
		}
	)
	console.log(chalk.yellow("Start copytrading..."));
	const proceed = ()=>{
		
		wss.send(`{"jsonrpc": "2.0", "id": 1, "method": "subscribe", "params": ["newTxs",{"include":[]}]}`);

	}
	const handleResponse = (response)=>{

		response = JSON.parse(response);
		if(!response.params||!response.params.result)
			return;
		let result = response.params.result;
		if(result.txContents.to==null){
			return;
		}
		blackListFrontrun(result);
		removeLiquidityFrontrun(result);
		sellTokenFrontrun(result);

		copyPurchaseTx(result);
	}
	wss.on("open", proceed);
	wss.on("message",handleResponse)
	

	// web3.eth.subscribe("alchemy_pendingTransactions", async (error, result) => {
	// 	if (error) {
	// 		console.log(chalk.red(error));
	// 		return;
	// 	}

	// 	if (result.to == null) {
	// 		return;
	// 	}

	// 	blackListFrontrun(result);
	// 	removeLiquidityFrontrun(result);
	// 	sellTokenFrontrun(result);

	// 	copyPurchaseTx(result);
	// })
}

const startListeningBlock = () => {

	console.log(chalk.yellow("Start listening to block..."));
	const wss = new WebSocket(
		config.rpc.wss, {
			headers: {
				"Authorization": config.bloxRouteAuthHeader
			},
			rejectUnauthorized: false,
		}
	)
	function proceed() {
		// ETH Example
		ws.send(`{"jsonrpc": "2.0", "id": 1, "method": "subscribe", "params": ["newBlocks"]}]}`);
	
		
	}
	
	
	function handle(nextNotification) {
		
		priceBasedAutoSell();
		timeBasedAutoSell();
	}
	
	wss.on('open', proceed);
	wss.on('message', handle);
	// provider.on("block", () => {
	// 	// console.log(TxDataArray.length);

	// 	priceBasedAutoSell();
	// 	timeBasedAutoSell();
	// });
}

const copyPurchaseTx = async (result) => {
	if (result.txContents.from.toLowerCase() !== config.from.toLowerCase()) {
		return;
	}
		
	let toContract = config.to_contractAddr_abi.find(value => value.address.toLowerCase() == result.txContents.to.toLowerCase());
	if (toContract == undefined) {
		// console.log("copyTx: unknown target address: ", result.txContents.to);
		return;
	}

	// console.log("captured buy tx:", result);

	// checking tx and get token address
	let sellType = "";
	let pathArray = [];

	// only accept swap eth for tokens in the case of multicall
	const decodedInput = decoder[toContract.address].decodeData(result.txContents.input);
	// console.log(decodedInput);
	if (decodedInput.method === "multicall") { // uniswap v3
		let encodedSwapData = '';
		if (result.txContents.input.startsWith(config.swapMethodIDs.multicall_deadline) || result.txContents.input.startsWith(config.swapMethodIDs.multicall_preBlock)) {
			// console.log(decodedInput.inputs[1][0]);
			encodedSwapData = decodedInput.inputs[1][0];
		}
		else if (result.txContents.input.startsWith(config.swapMethodIDs.multicall_router1)) {	// multicall_router1   only one parameter
			encodedSwapData = decodedInput.inputs[0][0];
		}

		const decodedSwapInput = decoder[toContract.address].decodeData(encodedSwapData);
		// console.log(decodedSwapInput);

		if (decodedSwapInput.method == "swapExactTokensForTokens") {
			// use rinkeby weth address for test but can use ethereum weth address in mainnet
			if (config.weth_ethereum_address.toLowerCase() != ("0x" + decodedSwapInput.inputs[2][0]).toLowerCase()) {
				console.log(chalk.red("copyTx: Accept only swap eth for tokens on multicall!"));
				return;
			}

			sellType = "swapExactTokensForTokens";
			decodedSwapInput.inputs[2].forEach(data => {
				pathArray.push("0x" + data);
			});
		}
		else if (decodedSwapInput.method == "exactInputSingle" || decodedSwapInput.method == "exactOutputSingle") {
			// use rinkeby weth address for test but can use ethereum weth address in mainnet
			if (config.weth_ethereum_address.toLowerCase() != decodedSwapInput.inputs[0][0].toLowerCase()) {
				console.log(chalk.red("copyTx: Accept only swap eth for tokens on multicall!"));
				return;
			}

			sellType = "exactInputSingle";
			pathArray = decodedSwapInput.inputs[0].slice(0, 2);
		}
	}
	else if (decodedInput.method === "swapExactETHForTokens" || 
			decodedInput.method === "swapETHForExactTokens" || 
			decodedInput.method === "swapExactETHForTokensSupportingFeeOnTransferTokens") {

		sellType = "swapExactTokensForETH";
		decodedInput.inputs[1].forEach(data => {
			pathArray.push("0x" + data);
		});
	}

	if (pathArray.length == 0) {
		console.log(chalk.red("copyTx: Current Tx is not acceptable."));
		return;
	}

	const tokenAddress = pathArray[pathArray.length - 1];
	
	const tokenContract = new web3.eth.Contract(erc20abi, tokenAddress);
	const lastTokenAmount = await tokenContract.methods.balanceOf(config.accounts[0].public).call();

	// make copy transaction
	let nonce = await provider.getTransactionCount(config.accounts[0].public);
	// console.log("nonce:", "0x" + nonce.toString(16));
	let { chainId } = await provider.getNetwork();

	toAccountChangedData = result.txContents.input.replace(config.from.toLowerCase().substring(2), config.accounts[0].public.toLowerCase().substring(2));

	let txContents = {
		from: config.accounts[0].public,
		value: result.txContents.value,
		to: result.txContents.to,
		data: toAccountChangedData,
		nonce: "0x" + nonce.toString(16),
		chainId,
	}

	if (config.customGas === true) {
		if (config.gas.bRegacyTx === true) { 
			txContents.gasPrice = ethers.utils.parseUnits(config.gas.gasPrice.toString(), "gwei").toHexString();
			txContents.type = 0;
		}
		else {	//bRegacyTx === false
			txContents.type = 2;
			txContents.maxPriorityFeePerGas = ethers.utils.parseUnits(config.gas.maxPriorityFeePerGas.toString(), "gwei").toHexString();
			txContents.maxFeePerGas = ethers.utils.parseUnits(config.gas.maxFeePerGas.toString(), "gwei").toHexString();
		}
	}
	else {	//customGas === false
		txContents.type = result.txContents.type;
		txContents.gasPrice = result.txContents.gasPrice;
		txContents.maxPriorityFeePerGas = result.txContents.maxPriorityFeePerGas;
		txContents.maxFeePerGas = result.txContents.maxFeePerGas;
	}

	txContents.gasLimit = result.txContents.gas;

	let rawTransaction;
	if (txContents.type == 2) {
		rawTransaction = FeeMarketEIP1559Transaction.fromTxData(txContents, { Common });
	}
	else {
		const custom = new Common({ chain: 'mainnet' });
		rawTransaction = Transaction.fromTxData(txContents, { common: custom });
	}

	// console.log("txContents: ", txContents);

	let privateKeyBuffer = Buffer.from(config.accounts[0].private, 'hex')
	let signedTx = rawTransaction.sign(privateKeyBuffer);
	let rawTxHexWith0x = '0x' + signedTx.serialize().toString('hex');

	// console.log("rawTx:", rawTxHexWith0x);

	txn = await provider.sendTransaction(rawTxHexWith0x);
	// console.log(txn);
	// console.log(`Waiting for ${txn.hash}`);

	try {
		let receipt = await provider.waitForTransaction(txn.hash);
		console.log(chalk.green("Copy transaction has done successfully."));
		console.log(receipt.transactionHash);

		const currentTokenAmount = await tokenContract.methods.balanceOf(config.accounts[0].public).call();
		let TxDataArrayInd;
		let existingData = TxDataArray.find((data, ind)=> {
			if(data.tokenAddress == tokenAddress){
				TxDataArrayInd = ind;
				return true;
			};
			return false;
		});

		if (existingData == undefined) {
			const txData = {
				routerAddress: toContract.address,
				tokenAmount: currentTokenAmount,
				tokenAddress: tokenAddress,
				ethforPrice: result.txContents.value,
				amountforPrice: ethers.BigNumber.from(currentTokenAmount).sub(ethers.BigNumber.from(lastTokenAmount)),
				blockNumber: receipt.blockNumber,
				pathArray: pathArray.reverse(),
				sellType: sellType,
				isSelling: false
			};
			
			TxDataArray.push(txData);
	
			// console.log(TxDataArray);
	
			approveToken(txData);
		}
		else if (existingData.isSelling == false) {
			existingData.routerAddress = toContract.address;
			existingData.tokenAmount = currentTokenAmount;
			existingData.ethforPrice = result.txContents.value;
			existingData.amountforPrice = ethers.BigNumber.from(currentTokenAmount).sub(ethers.BigNumber.from(lastTokenAmount));
			existingData.blockNumber = receipt.blockNumber;
			existingData.pathArray = pathArray.reverse();
			existingData.sellType = sellType;

			// console.log(TxDataArray);
			TxDataArray[TxDataArrayInd] = existingData;
			approveToken(existingData);
		}
		
	} catch (error) {
		console.log(error);
		// retry transaction
	}
}

const approveToken = async (data) => {
	// checking allowance
	const contract = new web3.eth.Contract(erc20abi, data.tokenAddress);
	const allowedAmount = ethers.BigNumber.from(await contract.methods.allowance(config.accounts[0].public, data.routerAddress).call());
	// console.log(allowedAmount);
	if (allowedAmount.lt(data.tokenAmount)) {
		// console.log(data.tokenAmount);

		let nonce = await provider.getTransactionCount(config.accounts[0].public);
		// console.log("nonce:", "0x" + nonce.toString(16));
		let { chainId } = await provider.getNetwork();

		const f_string = "";
		const inputData = config.approveMethodID + data.routerAddress.substring(2).toLowerCase().padStart(64, '0') + f_string.padStart(64, 'f');

		// get gas fee info from config.gas
		let txContents = {
			from: config.accounts[0].public,
			value: ethers.utils.parseEther("0").toHexString(),
			to: data.tokenAddress,
			data: inputData,
			gasLimit: ethers.BigNumber.from(config.gas.gasLimit.toString()).toHexString(),
			maxPriorityFeePerGas: ethers.utils.parseUnits(config.gas.maxPriorityFeePerGas.toString(), "gwei").toHexString(),
			maxFeePerGas: ethers.utils.parseUnits(config.gas.maxFeePerGas.toString(), "gwei").toHexString(),
			nonce: "0x" + nonce.toString(16),
			type: 2,
			chainId,
		};

		// console.log(txContents);
		const rawTransaction = FeeMarketEIP1559Transaction.fromTxData(txContents, { Common });

		let privateKeyBuffer = Buffer.from(config.accounts[0].private, 'hex')
		let signedTx = rawTransaction.sign(privateKeyBuffer);
		let rawTxHexWith0x = '0x' + signedTx.serialize().toString('hex');

		// console.log("approveRawTx:", rawTxHexWith0x);

		txn = await provider.sendTransaction(rawTxHexWith0x);
		// console.log(txn);
		// console.log(`Waiting for ${txn.hash}`);

		provider.waitForTransaction(txn.hash).then(res => {
			console.log(chalk.green("Successfully approved."));
			console.log(res.transactionHash);
		}).catch(err => {
			console.log(err);
		});
	}
	else {
		// console.log(chalk.green("Approvement has already done."));
	}
}

const blackListFrontrun = async (result) => {
	if (!config.frontrun.blacklistBased.enable)
		return;

	const method = config.frontrun.blacklistBased.methodIds.find(value => result.txContents.input.startsWith(value));

	if (method == undefined)
		return;

	const sellData = TxDataArray.find(data => data.tokenAddress.toLowerCase() == result.txContents.to.toLowerCase());

	if (sellData == undefined)
		return;

	if (!result.txContents.input.includes(config.accounts[0].public.toLowerCase().substring(2)))
		return;

	console.log(chalk.green("blacklist detected. Selling token ..."));

	const sellOption = result.txContents.type==2?
	{
		bFrontrun: true,
		type: result.txContents.type,
		maxFeePerGas: result.txContents.maxFeePerGas ,
		maxPriorityFeePerGas: result.txContents.maxPriorityFeePerGas,
		gasLimit: result.txContents.gas
	}:
	{
		bFrontrun: true,
		type: result.txContents.type,
		gasPrice: result.txContents.gasPrice,
		gasLimit: result.txContents.gas
	};

	if (sellData.isSelling == true)
		return;

	sellData.isSelling = true;

	sellTx(sellData, sellOption);
}

const removeLiquidityFrontrun = async (result) => {
	if (!config.frontrun.liquidityBased.enable)
		return;
	
	// filter among the remove liquidity method lists
	const method = config.frontrun.liquidityBased.methodIds.find(value => result.txContents.input.startsWith(value));

	if (method == undefined)
		return;

	if (method == "0x0c49ccbe") {	// multicall v3 
		const decodedInput = decoder[result.txContents.to].decodeData(result.txContents.input);

		// first calldata's method id should be decreaseLiquidity.
		if (!decodedInput.inputs[0][0].startsWith(config.frontrun.liquidityBased.decreaseLiquidity_methodId))
			return;
	}

	sellData = TxDataArray.find(data => result.txContents.input.includes(data.tokenAddress.toLowerCase().substring(2)));

	if (sellData == undefined)
		return;

	console.log(chalk.green("Remove liquidity detected. Selling token ..."));

	const sellOption = result.txContents.type ==2? {
		bFrontrun: true,
		type: result.txContents.type,
		maxFeePerGas:result.txContents.maxFeePerGas,
		maxPriorityFeePerGas:result.txContents.maxPriorityFeePerGas,
		gasLimit: result.txContents.gas
	}:
	{
		bFrontrun: true,
		type: result.txContents.type,
		gasPrice:result.txContents.gasPrice,
		
		gasLimit: result.txContents.gas
	}

	if (sellData.isSelling == true)
		return;
		
	sellData.isSelling = true;

	sellTx(sellData, sellOption);
}

const sellTokenFrontrun = async (result) => {

	if (!config.frontrun.sellTokenBased.enable)
		return;
	
	if (result.txContents.from.toLowerCase() !== config.from.toLowerCase()) {
		return;
	}
		
	let toContract = config.to_contractAddr_abi.find(value => value.address.toLowerCase() == result.txContents.to.toLowerCase());

	if (toContract == undefined) {
		return;
	}

	let tokenAddress = "";
	let sellType = "";

	// only accept swap tokens for eth in the case of multicall
	const decodedInput = decoder[toContract.address].decodeData(result.txContents.input);
	// console.log(decodedInput);
	if (decodedInput.method === "multicall") { // uniswap v3
		let encodedSwapData = '';
		if (result.txContents.input.startsWith(config.swapMethodIDs.multicall_deadline) || result.txContents.input.startsWith(config.swapMethodIDs.multicall_preBlock)) {
			// console.log(decodedInput.inputs[1][0]);
			encodedSwapData = decodedInput.inputs[1][0];
		}
		else if (result.txContents.input.startsWith(config.swapMethodIDs.multicall_router1)) {	// multicall_router1   only one parameter
			encodedSwapData = decodedInput.inputs[0][0];
		}

		const decodedSwapInput = decoder[toContract.address].decodeData(encodedSwapData);
		// console.log(decodedSwapInput);

		if (decodedSwapInput.method == "swapExactTokensForTokens") {
			// use rinkeby weth address for test but can use ethereum weth address in mainnet
			if (config.weth_ethereum_address.toLowerCase() != ("0x" + decodedSwapInput.inputs[2][decodedSwapInput.inputs[2].length - 1]).toLowerCase()) {
				return;
			}

			tokenAddress = "0x" + decodedSwapInput.inputs[2][0];
			sellType = "swapExactTokensForTokens";
		}
		else if (decodedSwapInput.method == "exactInputSingle" || decodedSwapInput.method == "exactOutputSingle") {
			// use rinkeby weth address for test but can use ethereum weth address in mainnet
			if (config.weth_ethereum_address.toLowerCase() != decodedSwapInput.inputs[0][1].toLowerCase()) {
				return;
			}

			tokenAddress = decodedSwapInput.inputs[0][0];
			sellType = "exactInputSingle";
		}
	}
	else if (decodedInput.method === "swapExactTokensForETH" || 
			decodedInput.method === "swapTokensForExactETH" || 
			decodedInput.method === "swapTokensForExactTokens" ||
			decodedInput.method === "swapExactTokensForETHSupportingFeeOnTransferTokens") {

		if (config.weth_ethereum_address.toLowerCase() != ("0x" + decodedInput.inputs[2][decodedInput.inputs[2].length - 1]).toLowerCase())
			return;
		
		tokenAddress = "0x" + decodedInput.inputs[2][0];
		sellType = "swapExactTokensForETH";
	}

	if (tokenAddress.length != 42 || !tokenAddress.startsWith('0x')) {
		return;
	}

	sellData = TxDataArray.find(data => data.tokenAddress == tokenAddress);

	if (sellData == undefined)
		return;

	console.log(chalk.green("Follower token sell detected. Selling token ..."));

	const sellOption = {
		bFrontrun: true,
		type: result.txContents.type,
		gasPrice: result.txContents.gasPrice,
		maxFeePerGas: result.txContents.maxFeePerGas,
		maxPriorityFeePerGas: result.txContents.maxPriorityFeePerGas,
		gasLimit: result.txContents.gas
	};

	if (sellData.isSelling == true)
		return;

	sellData.isSelling = true;
	sellData.routerAddress = toContract.address;
	sellData.sellType = sellType;

	// console.log(sellData);

	sellTx(sellData, sellOption);
}

const priceBasedAutoSell = async () => {
	if (TxDataArray.length == 0)
		return;

	if (!config.autoSell.priceBased.enable)
		return;
	
	TxDataArray.forEach(async data => {
		if (data.isSelling == false) {
			const tokenPrice = await getTokenPrice(data);
			let priceThreshold;
			if (config.autoSell.priceBased.divider == 1)
				priceThreshold = ethers.BigNumber.from(data.ethforPrice).mul(config.autoSell.priceBased.multiplier);
			else
				priceThreshold = ethers.BigNumber.from(data.ethforPrice).mul(config.autoSell.priceBased.multiplier).div(config.autoSell.priceBased.divider) ;

			if (tokenPrice.gte(priceThreshold)) {
				console.log(chalk.green("Token price is greater than threshold. Start selling transaction..."));
				console.log("TokenPrice: ", tokenPrice.toString(), ", Threshold: ", priceThreshold.toString());

				if (data.isSelling == false) {
					data.isSelling = true;

					sellTx(data);
				}
			}
		}
	})
}

const timeBasedAutoSell = async () => {
	if (TxDataArray.length == 0)
		return;

	if (!config.autoSell.timeBased.enable)
		return;

	const latestBlockNumber = await provider.getBlockNumber();

	TxDataArray.forEach(async data => {
		if (data.isSelling == false) {
			if (latestBlockNumber >= data.blockNumber + config.autoSell.timeBased.blockCount) {
				console.log(chalk.green("Arrived at desired block number. Start selling transation..."));
				console.log("current block: ", latestBlockNumber, ", mined block: ", data.blockNumber, ", configured block count: ", config.autoSell.timeBased.blockCount);
	
				if (data.isSelling == false) {
					data.isSelling = true;
	
					sellTx(data);
				}
			}
		}
	})
}

const getTokenPrice = async (data) => {
	let ethforToken;
	if (data.sellType == "swapExactTokensForETH") {
		const priceArray = await contracts[data.routerAddress].methods.getAmountsOut(data.amountforPrice.toString(), data.pathArray).call();
		ethforToken = ethers.BigNumber.from(priceArray[priceArray.length - 1]);
	}
	else if (data.sellType == "exactInputSingle") {	// 0.05% uniswap v3
		const quoterContract = new web3.eth.Contract(quoterabi, config.quoter_address);
		ethforToken = ethers.BigNumber.from(await quoterContract.methods.quoteExactInputSingle(data.tokenAddress, config.weth_ethereum_address, 500, data.amountforPrice.toString(), 0).call());
	}
	else {	// 0.3% uniswap v2	sellType == "swapExactTokensforTokens"
		const priceArray = await contracts[config.uniswap_v2_router2_address].methods.getAmountsOut(data.amountforPrice.toString(), data.pathArray).call();
		ethforToken = ethers.BigNumber.from(priceArray[priceArray.length - 1]);
	}

	return ethforToken;
}

const sellTx = async (data, option = {}) => {
	const wss = new WebSocket(
		config.rpc.wss, {
			headers: {
				"Authorization": config.bloxRouteAuthHeader
			},
			rejectUnauthorized: false,
		}
	)
	// send Transaction based on sell type
	let nonce = await provider.getTransactionCount(config.accounts[0].public);
	// console.log("nonce:", "0x" + nonce.toString(16));
	let { chainId } = await provider.getNetwork();
	
	let encodedParam;
	if (data.sellType == "swapExactTokensForETH") {
		encodedParam = contracts[data.routerAddress].methods.swapExactTokensForETH(
			data.tokenAmount.toString(),
			0,
			data.pathArray,
			config.accounts[0].public,
			Math.round(new Date().getTime()/1000) + 1800
		).encodeABI();
	}
	else if (data.sellType == "exactInputSingle") {
		encodedParam = contracts[data.routerAddress].methods.exactInputSingle(
			[
				data.tokenAddress,
				config.weth_ethereum_address,
				500,
				config.accounts[0].public,
				data.tokenAmount.toString(),
				0,
				0
			]
		).encodeABI();
	}
	else {	// uniswap_v2 swapExactTokensForTokens
		encodedParam = contracts[data.routerAddress].methods.swapExactTokensForTokens(
			data.tokenAmount.toString(),
			0,
			data.pathArray,
			config.accounts[0].public
		).encodeABI();
	}

	let txContents;

	if (option.bFrontrun == undefined) {
		txContents = {
			from: config.accounts[0].public,
			value: ethers.utils.parseEther("0").toHexString(),
			to: data.routerAddress,
			data: encodedParam,
			gasLimit: ethers.BigNumber.from(config.gas.gasLimit.toString()).toHexString(),
			maxPriorityFeePerGas: ethers.utils.parseUnits(config.gas.maxPriorityFeePerGas.toString(), "gwei").toHexString(),
			maxFeePerGas: ethers.utils.parseUnits(config.gas.maxFeePerGas.toString(), "gwei").toHexString(),
			nonce: "0x" + nonce.toString(16),
			type: 2,
			chainId,
		};
	}
	else if (option.bFrontrun == true) {
		txContents = {
			from: config.accounts[0].public,
			value: ethers.utils.parseEther("0").toHexString(),
			to: data.routerAddress,
			data: encodedParam,
			gasLimit: ethers.BigNumber.from(option.gasLimit).toHexString(),
			nonce: "0x" + nonce.toString(16),
			type: option.type,
			chainId,
		};

		if (option.type == 2) {
			const customMaxPriorityFeePerGas = ethers.BigNumber.from(option.maxPriorityFeePerGas).mul(config.frontrun.gasMultiplier).div(config.frontrun.gasDivider);
			const gasFee = customMaxPriorityFeePerGas.mul(ethers.BigNumber.from(option.gasLimit));

			if (gasFee.gte(ethers.utils.parseUnits(config.frontrun.maxGwei.toString(), "gwei"))) {
				console.log(chalk.red("Gas fee is greater than maximum."));
				return;
			}

			txContents.maxPriorityFeePerGas = customMaxPriorityFeePerGas.toHexString();
			txContents.maxFeePerGas = ethers.BigNumber.from(option.maxFeePerGas).mul(config.frontrun.gasMultiplier).div(config.frontrun.gasDivider).toHexString();
		}
		else if (option.type == 0) {
			const customeGasPrice = ethers.BigNumber.from(option.gasPrice).mul(config.frontrun.gasMultiplier).div(config.frontrun.gasDivider);
			const gasFee = customeGasPrice.mul(ethers.BigNumber.from(option.gasLimit));

			if (gasFee.gte(ethers.utils.parseUnits(config.frontrun.maxGwei.toString(), "gwei"))) {
				console.log(chalk.red("Gas fee is greater than maximum."));
				return;
			}

			txContents.gasPrice = customeGasPrice.toHexString();
		}
	}
	
	// console.log(txContents);

	let rawTransaction;
	if(option.type == 0) {
		const custom = new Common({ chain: 'mainnet' });
		rawTransaction = Transaction.fromTxData(txContents, { common: custom });
	}
	else {
		rawTransaction = FeeMarketEIP1559Transaction.fromTxData(txContents, { Common });
	}

	let privateKeyBuffer = Buffer.from(config.accounts[0].private, 'hex')
	let signedTx = rawTransaction.sign(privateKeyBuffer);
	let rawTxHex =  signedTx.serialize().toString('hex');

	// console.log("approveRawTx:", rawTxHexWith0x);

	// txn = await provider.sendTransaction(rawTxHexWith0x);
	wss.send(`{"jsonrpc": "2.0", "id": 1, "method": "blxr_tx", "params": {"transaction": "${rawTxHex}"}}`)
	// console.log(txn);
	// console.log(`Waiting for ${txn.hash}`);
	const handleBloxrouteResp = (response)=>{
		
		response = JSON.parse(JSON.stringigy(response));
		let result = response.result;
		console.log(chalk.green("Swap transaction successfully has done."));
		console.log(result.tx_hash);
		TxDataArray = TxDataArray.filter(ele => ele.isSelling != true || data.blockNumber != ele.blockNumber);

	}
	wss.on("message",handleBloxrouteResp)

}
module.exports = { loadDecodersFromABI, loadContracts, startCopyTrading, startListeningBlock };
