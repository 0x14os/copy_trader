const chalk = require('chalk');
const { loadDecodersFromABI, loadContracts, startCopyTrading, startListeningBlock } = require('./bxroute');

const run = async () => {
	loadDecodersFromABI();
	loadContracts();
	startCopyTrading();
	startListeningBlock();
}

run();
