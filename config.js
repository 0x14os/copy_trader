const config = {
	accounts: [
		{
			public: "0xEb7a88704BD9a8C173D1750D19d46F12653163Ef",		//account 2
			private: ""
		}
	],
	rpc: {
		https: "http://localhost:28332",
		wss: "ws://127.0.0.1:28333/ws"
	},
	alchemy_rpc: {
		https: "https://eth-rinkeby.alchemyapi.io/v2/-vOF5rrTYSVLGbwVXdMfe14vRI9BPGRK",
		wss: "wss://eth-rinkeby.alchemyapi.io/v2/-vOF5rrTYSVLGbwVXdMfe14vRI9BPGRK",
	},
	bloxRouteAuthHeader: "MWExNTQ0OGUtNjQzZS00MGRmLThmMDgtNWY4YzE2NmIyZjZjOmEzOTRjYzE3N2U2MTg1YmZkN2UyZTY3ODJjZGUzZDRj",
	customGas: true,
	gas: {
		bRegacyTx: false,
		gasPrice: 2.5,
		maxPriorityFeePerGas: 1.5,
		maxFeePerGas: 1.6,
		gasLimit: 250000
	},
	// from: "0x90F5Ab8408C3E6797e203914aa8a50B3d7d92CfD",
	from: "0x7Bdf97C77183c8005b9565fc5E6B3Bd48eba81F0",
	autoSell: {
		priceBased : {
			enable: true,
			multiplier: 3,		//decimal = multiplier / divider
			divider: 1			// integer -> divider = 1
		},
		timeBased: {
			enable: true,
			blockCount: 10000
		},
	},
	frontrun: {
		blacklistBased: {
			enable: true,
			methodIds: [
				"0xd34628cc",	// 0xa1cb63D49469F91d97852f647948eEf1EE76207F   mainnet
				"0x9c52a7f1"	// 0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735   rinkeby DAI
			]
		},
		liquidityBased: {
			enable: true,
			methodIds: [
				"0xded9382a",	// removeLiquidityETHWithPermit
				"0x5b0d5984",	// removeLiquidityETHWithPermitSupportingFeeOnTransferTokens
				"0x02751cec",   // removeLiquidityETH
				"0xaf2979eb",	// removeLiquidityETHSupportingFeeOnTransferTokens
				"0xac9650d8"	// multicall      uniswap_v3
			],
			decreaseLiquidity_methodId: "0x0c49ccbe"
		},
		sellTokenBased: {
			enable: true,
		},
		gasMultiplier: 5,	// decimal = multiplier / divider
		gasDivider: 1,		// integer -> divider = 1
		maxGwei : 2000000,
	},
	approveMethodID : "0x095ea7b3",
	swapMethodIDs: {
		swapExactETHForTokens: "0x7ff36ab5",			//  sushiswap, uniswap_v2_router, uniswap_v2_router_2
		swapETHForExactTokens: "0xfb3bdb41",			//  sushiswap, uniswap_v2_router
		SwapExactEthForTokensSupportingFeeOnTransferTokens: "0xb6f9de95",	//  sushiswap, uniswap_v2_router
		multicall_router1: "oxac9650d8",				// uniswap v3 router1 (bytes[] data)
		multicall_deadline: "0x5ae401dc",			//  uniswap v3 router2	(uint256 deadline, bytes[] data)
		multicall_preBlock: "0x1f0464d1"			//  uniswap v3 router2	(byte32 previousBlockhash, bytes[] data)
	},
	weth_rinkeby_address: "0xc778417E063141139Fce010982780140Aa0cD5Ab",
	weth_ethereum_address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
	uniswap_v2_router2_address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
	quoter_address: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
	to_contractAddr_abi: [
		{
			address: "0xf164fC0Ec4E93095b804a4795bBe1e041497b92a",
			abiFileName: "abi_uniswap_v2_router.json"
		},
		{
			address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
			abiFileName: "abi_uniswap_v2_router_2.json"
		},
		{
			address: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
			abiFileName: "abi_sushiswap_router.json"
		},
		{
			address: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
			abiFileName: "abi_uniswap_v3_router.json"
		},
		{
			address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
			abiFileName: "abi_uniswap_v3_router_2.json"
		},
		{
			address: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",		//rinkeby address
			abiFileName: "abi_sushiswap_router.json"
		},
		{
			address: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
			abiFileName: "NonfungiblePositionManager.json"
		}
	],
};

module.exports = config;
