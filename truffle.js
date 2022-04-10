const HDWalletProvider = require("@truffle/hdwallet-provider");
const mnemonic = "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

module.exports = {
  networks: {
    development: {
      provider: function() {
        return new HDWalletProvider(mnemonic, "http://127.0.0.1:7545/", 0, 50);
      },
      network_id: '*',
      websockets: true,
      // gas: 6721975,
      // gasPrice: 20000000000
    }
  },
  compilers: {
    solc: {
      version: "^0.8.14"
    }
  }
};