(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends2 = require("babel-runtime/helpers/extends");

var _extends3 = _interopRequireDefault(_extends2);

var _assign = require("babel-runtime/core-js/object/assign");

var _assign2 = _interopRequireDefault(_assign);

var _regenerator = require("babel-runtime/regenerator");

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require("babel-runtime/helpers/asyncToGenerator");

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

var _utils = require("./utils");

var _createHash = require("create-hash");

var _createHash2 = _interopRequireDefault(_createHash);

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

// TODO future refactoring
// - drop utils.js & refactoring with async/await style
// - try to avoid every place we do hex<>Buffer conversion. also accept Buffer as func parameters (could accept both a string or a Buffer in the API)
// - there are redundant code across apps (see Eth vs Btc). we might want to factorize it somewhere. also each app apdu call should be abstracted it out as an api
var MAX_SCRIPT_BLOCK = 50;
var DEFAULT_LOCKTIME = 0;
var DEFAULT_SEQUENCE = 0xffffffff;
var SIGHASH_ALL = 1;
var OP_PUSHDATA1 = 0x76;
var OP_HASH160 = 0xa9;
var HASH_SIZE = 0x14;
var OP_EQUALVERIFY = 0x88;
var OP_CHECKSIG = 0xac;
/**
 * Bitcoin API.
 *
 * @example
 * import Btc from "@ledgerhq/hw-app-btc";
 * const btc = new Btc(transport)
 */

var Btc = function () {
  function Btc(transport) {
    (0, _classCallCheck3.default)(this, Btc);

    this.transport = transport;
    transport.decorateAppAPIMethods(this, ["getWalletPublicKey", "signP2SHTransaction", "signMessageNew", "createPaymentTransactionNew"], "BTC");
  }

  (0, _createClass3.default)(Btc, [{
    key: "hashPublicKey",
    value: function hashPublicKey(buffer) {
      return (0, _createHash2.default)("rmd160").update((0, _createHash2.default)("sha256").update(buffer).digest()).digest();
    }
  }, {
    key: "getWalletPublicKey_private",
    value: function getWalletPublicKey_private(path, verify, segwit) {
      var paths = (0, _utils.splitPath)(path);
      var p1 = 0x00;
      var p2 = 0x00;
      if (verify === true) {
        p1 = 0x01;
      }
      if (segwit == true) {
        p2 = 0x01;
      }
      var buffer = Buffer.alloc(1 + paths.length * 4);
      buffer[0] = paths.length;
      paths.forEach(function (element, index) {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      return this.transport.send(0xe0, 0x40, p1, p2, buffer).then(function (response) {
        var publicKeyLength = response[0];
        var addressLength = response[1 + publicKeyLength];
        var publicKey = response.slice(1, 1 + publicKeyLength).toString("hex");
        var bitcoinAddress = response.slice(1 + publicKeyLength + 1, 1 + publicKeyLength + 1 + addressLength).toString("ascii");
        var chainCode = response.slice(1 + publicKeyLength + 1 + addressLength, 1 + publicKeyLength + 1 + addressLength + 32).toString("hex");
        return { publicKey: publicKey, bitcoinAddress: bitcoinAddress, chainCode: chainCode };
      });
    }

    /**
     * @param path a BIP 32 path
     * @param segwit use segwit
     * @example
     * btc.getWalletPublicKey("44'/0'/0'/0").then(o => o.bitcoinAddress)
     */

  }, {
    key: "getWalletPublicKey",
    value: function getWalletPublicKey(path) {
      var verify = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      var segwit = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

      return this.getWalletPublicKey_private(path, verify, segwit);
    }
  }, {
    key: "getTrustedInputRaw",
    value: function getTrustedInputRaw(transactionData, indexLookup) {
      var data = void 0;
      var firstRound = false;
      if (typeof indexLookup === "number") {
        firstRound = true;
        var prefix = Buffer.alloc(4);
        prefix.writeUInt32BE(indexLookup, 0);
        data = Buffer.concat([prefix, transactionData], transactionData.length + 4);
      } else {
        data = transactionData;
      }
      return this.transport.send(0xe0, 0x42, firstRound ? 0x00 : 0x80, 0x00, data).then(function (trustedInput) {
        return trustedInput.slice(0, trustedInput.length - 2).toString("hex");
      });
    }
  }, {
    key: "getTrustedInput",
    value: function getTrustedInput(indexLookup, transaction) {
      var _this = this;

      var inputs = transaction.inputs,
          outputs = transaction.outputs,
          locktime = transaction.locktime;

      if (!outputs || !locktime) {
        throw new Error("getTrustedInput: locktime & outputs is expected");
      }

      var processScriptBlocks = function processScriptBlocks(script, sequence) {
        var scriptBlocks = [];
        var offset = 0;
        while (offset !== script.length) {
          var blockSize = script.length - offset > MAX_SCRIPT_BLOCK ? MAX_SCRIPT_BLOCK : script.length - offset;
          if (offset + blockSize !== script.length) {
            scriptBlocks.push(script.slice(offset, offset + blockSize));
          } else {
            scriptBlocks.push(Buffer.concat([script.slice(offset, offset + blockSize), sequence]));
          }
          offset += blockSize;
        }
        return (0, _utils.eachSeries)(scriptBlocks, function (scriptBlock) {
          return _this.getTrustedInputRaw(scriptBlock);
        });
      };

      var processInputs = function processInputs() {
        return (0, _utils.eachSeries)(inputs, function (input) {
          var data = Buffer.concat([input.prevout, _this.createVarint(input.script.length)]);
          return _this.getTrustedInputRaw(data).then(function () {
            return (
              // iteration (eachSeries) ended
              // TODO notify progress
              // deferred.notify("input");
              processScriptBlocks(input.script, input.sequence)
            );
          });
        }).then(function () {
          var data = _this.createVarint(outputs.length);
          return _this.getTrustedInputRaw(data);
        });
      };

      var processOutputs = function processOutputs() {
        return (0, _utils.eachSeries)(outputs, function (output) {
          var data = output.amount;
          data = Buffer.concat([data, _this.createVarint(output.script.length), output.script]);
          return _this.getTrustedInputRaw(data).then(function () {
            // iteration (eachSeries) ended
            // TODO notify progress
            // deferred.notify("output");
          });
        }).then(function () {
          return _this.getTrustedInputRaw(locktime);
        });
      };

      var data = Buffer.concat([transaction.version, transaction.timestamp || Buffer.alloc(0), this.createVarint(inputs.length)]);
      return this.getTrustedInputRaw(data, indexLookup).then(processInputs).then(processOutputs);
    }
  }, {
    key: "getTrustedInputBIP143",
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(indexLookup, transaction) {
        var sha, hash, data, outputs, locktime;
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                if (transaction) {
                  _context.next = 2;
                  break;
                }

                throw new Error("getTrustedInputBIP143: missing tx");

              case 2:
                sha = (0, _createHash2.default)("sha256");

                sha.update(this.serializeTransaction(transaction, true));
                hash = sha.digest();

                sha = (0, _createHash2.default)("sha256");
                sha.update(hash);
                hash = sha.digest();
                data = Buffer.alloc(4);

                data.writeUInt32LE(indexLookup, 0);
                outputs = transaction.outputs, locktime = transaction.locktime;

                if (!(!outputs || !locktime)) {
                  _context.next = 13;
                  break;
                }

                throw new Error("getTrustedInputBIP143: locktime & outputs is expected");

              case 13:
                if (outputs[indexLookup]) {
                  _context.next = 15;
                  break;
                }

                throw new Error("getTrustedInputBIP143: wrong index");

              case 15:
                hash = Buffer.concat([hash, data, outputs[indexLookup].amount]);
                _context.next = 18;
                return hash.toString("hex");

              case 18:
                return _context.abrupt("return", _context.sent);

              case 19:
              case "end":
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function getTrustedInputBIP143(_x3, _x4) {
        return _ref.apply(this, arguments);
      }

      return getTrustedInputBIP143;
    }()
  }, {
    key: "getVarint",
    value: function getVarint(data, offset) {
      if (data[offset] < 0xfd) {
        return [data[offset], 1];
      }
      if (data[offset] === 0xfd) {
        return [(data[offset + 2] << 8) + data[offset + 1], 3];
      }
      if (data[offset] === 0xfe) {
        return [(data[offset + 4] << 24) + (data[offset + 3] << 16) + (data[offset + 2] << 8) + data[offset + 1], 5];
      }

      throw new Error("getVarint called with unexpected parameters");
    }
  }, {
    key: "startUntrustedHashTransactionInputRaw",
    value: function startUntrustedHashTransactionInputRaw(newTransaction, firstRound, transactionData) {
      var bip143 = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

      return this.transport.send(0xe0, 0x44, firstRound ? 0x00 : 0x80, newTransaction ? bip143 ? 0x02 : 0x00 : 0x80, transactionData);
    }
  }, {
    key: "startUntrustedHashTransactionInput",
    value: function startUntrustedHashTransactionInput(newTransaction, transaction, inputs) {
      var _this2 = this;

      var bip143 = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

      var data = Buffer.concat([transaction.version, transaction.timestamp || Buffer.alloc(0), this.createVarint(transaction.inputs.length)]);
      return this.startUntrustedHashTransactionInputRaw(newTransaction, true, data, bip143).then(function () {
        var i = 0;
        return (0, _utils.eachSeries)(transaction.inputs, function (input) {
          var prefix = void 0;
          if (inputs[i].trustedInput) {
            if (bip143) {
              prefix = Buffer.from([0x02]);
            } else {
              prefix = Buffer.from([0x01, inputs[i].value.length]);
            }
          } else {
            prefix = Buffer.from([0x00]);
          }
          data = Buffer.concat([prefix, inputs[i].value, _this2.createVarint(input.script.length)]);
          return _this2.startUntrustedHashTransactionInputRaw(newTransaction, false, data, bip143).then(function () {
            var scriptBlocks = [];
            var offset = 0;
            if (input.script.length === 0) {
              scriptBlocks.push(input.sequence);
            } else {
              while (offset !== input.script.length) {
                var blockSize = input.script.length - offset > MAX_SCRIPT_BLOCK ? MAX_SCRIPT_BLOCK : input.script.length - offset;
                if (offset + blockSize !== input.script.length) {
                  scriptBlocks.push(input.script.slice(offset, offset + blockSize));
                } else {
                  scriptBlocks.push(Buffer.concat([input.script.slice(offset, offset + blockSize), input.sequence]));
                }
                offset += blockSize;
              }
            }
            return (0, _utils.eachSeries)(scriptBlocks, function (scriptBlock) {
              return _this2.startUntrustedHashTransactionInputRaw(newTransaction, false, scriptBlock, bip143);
            }).then(function () {
              i++;
            });
          });
        });
      });
    }
  }, {
    key: "provideOutputFullChangePath",
    value: function provideOutputFullChangePath(path) {
      var paths = (0, _utils.splitPath)(path);
      var buffer = Buffer.alloc(1 + paths.length * 4);
      buffer[0] = paths.length;
      paths.forEach(function (element, index) {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      return this.transport.send(0xe0, 0x4a, 0xff, 0x00, buffer);
    }
  }, {
    key: "hashOutputFull",
    value: function hashOutputFull(outputScript) {
      var _this3 = this;

      var offset = 0;
      return (0, _utils.asyncWhile)(function () {
        return offset < outputScript.length;
      }, function () {
        var blockSize = offset + MAX_SCRIPT_BLOCK >= outputScript.length ? outputScript.length - offset : MAX_SCRIPT_BLOCK;
        var p1 = offset + blockSize === outputScript.length ? 0x80 : 0x00;
        var data = outputScript.slice(offset, offset + blockSize);
        return _this3.transport.send(0xe0, 0x4a, p1, 0x00, data).then(function () {
          offset += blockSize;
        });
      });
    }
  }, {
    key: "signTransaction",
    value: function signTransaction(path) {
      var lockTime = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : DEFAULT_LOCKTIME;
      var sigHashType = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : SIGHASH_ALL;

      var paths = (0, _utils.splitPath)(path);
      var buffer = Buffer.alloc(1 + paths.length * 4 + 1 + 4 + 1); // TODO shouldn't have to calc that, just use buffer concat all the way down
      var offset = 0;
      buffer[offset++] = paths.length;
      paths.forEach(function (element) {
        buffer.writeUInt32BE(element, offset);
        offset += 4;
      });
      buffer[offset++] = 0x00; // authorization length
      buffer.writeUInt32BE(lockTime, offset);
      offset += 4;
      buffer[offset++] = sigHashType;
      return this.transport.send(0xe0, 0x48, 0x00, 0x00, buffer).then(function (result) {
        result[0] = 0x30;
        return result.slice(0, result.length - 2);
      });
    }

    /**
     * You can sign a message according to the Bitcoin Signature format and retrieve v, r, s given the message and the BIP 32 path of the account to sign.
     * @example
     btc.signMessageNew_async("44'/60'/0'/0'/0", Buffer.from("test").toString("hex")).then(function(result) {
       var v = result['v'] + 27 + 4;
       var signature = Buffer.from(v.toString(16) + result['r'] + result['s'], 'hex').toString('base64');
       console.log("Signature : " + signature);
     }).catch(function(ex) {console.log(ex);});
     */

  }, {
    key: "signMessageNew",
    value: function signMessageNew(path, messageHex) {
      var _this4 = this;

      var paths = (0, _utils.splitPath)(path);
      var message = new Buffer(messageHex, "hex");
      var offset = 0;
      var toSend = [];

      var _loop = function _loop() {
        var maxChunkSize = offset === 0 ? MAX_SCRIPT_BLOCK - 1 - paths.length * 4 - 4 : MAX_SCRIPT_BLOCK;
        var chunkSize = offset + maxChunkSize > message.length ? message.length - offset : maxChunkSize;
        var buffer = new Buffer(offset === 0 ? 1 + paths.length * 4 + 2 + chunkSize : chunkSize);
        if (offset === 0) {
          buffer[0] = paths.length;
          paths.forEach(function (element, index) {
            buffer.writeUInt32BE(element, 1 + 4 * index);
          });
          buffer.writeUInt16BE(message.length, 1 + 4 * paths.length);
          message.copy(buffer, 1 + 4 * paths.length + 2, offset, offset + chunkSize);
        } else {
          message.copy(buffer, 0, offset, offset + chunkSize);
        }
        toSend.push(buffer);
        offset += chunkSize;
      };

      while (offset !== message.length) {
        _loop();
      }
      return (0, _utils.foreach)(toSend, function (data, i) {
        return _this4.transport.send(0xe0, 0x4e, 0x00, i === 0 ? 0x01 : 0x80, data);
      }).then(function () {
        return _this4.transport.send(0xe0, 0x4e, 0x80, 0x00, Buffer.from([0x00])).then(function (response) {
          var v = response[0] - 0x30;
          var r = response.slice(4, 4 + response[3]);
          if (r[0] === 0) {
            r = r.slice(1);
          }
          r = r.toString("hex");
          var offset = 4 + response[3] + 2;
          var s = response.slice(offset, offset + response[offset - 1]);
          if (s[0] === 0) {
            s = s.slice(1);
          }
          s = s.toString("hex");
          return { v: v, r: r, s: s };
        });
      });
    }

    /**
     * To sign a transaction involving standard (P2PKH) inputs, call createPaymentTransactionNew with the following parameters
     * @param inputs is an array of [ transaction, output_index, optional redeem script, optional sequence ] where
     *
     * * transaction is the previously computed transaction object for this UTXO
     * * output_index is the output in the transaction used as input for this UTXO (counting from 0)
     * * redeem script is the optional redeem script to use when consuming a Segregated Witness input
     * * sequence is the sequence number to use for this input (when using RBF), or non present
     * @param associatedKeysets is an array of BIP 32 paths pointing to the path to the private key used for each UTXO
     * @param changePath is an optional BIP 32 path pointing to the path to the public key used to compute the change address
     * @param outputScriptHex is the hexadecimal serialized outputs of the transaction to sign
     * @param lockTime is the optional lockTime of the transaction to sign, or default (0)
     * @param sigHashType is the hash type of the transaction to sign, or default (all)
     * @param segwit is a boolean indicating wether to use segwit or not
     * @param initialTimestamp is the timestamp when the function is called, not the one that the tx will include
     * @param additionals list of additionnal options ("abc" for bch, "gold" for btg, "bipxxx" for using BIPxxx)
     * @return the signed transaction ready to be broadcast
     * @example
    btc.createPaymentTransactionNew(
     [ [tx1, 1] ],
     ["0'/0/0"],
     undefined,
     "01905f0100000000001976a91472a5d75c8d2d0565b656a5232703b167d50d5a2b88ac"
    ).then(res => ...);
     */

  }, {
    key: "createPaymentTransactionNew",
    value: function createPaymentTransactionNew(inputs, associatedKeysets, changePath, outputScriptHex) {
      var lockTime = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : DEFAULT_LOCKTIME;
      var sigHashType = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : SIGHASH_ALL;
      var segwit = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : false;

      var _this5 = this;

      var initialTimestamp = arguments[7];
      var additionals = arguments[8];

      var hasTimestamp = initialTimestamp !== undefined;
      var startTime = Date.now();
      var useBip143 = segwit || !!additionals && (additionals.includes("abc") || additionals.includes("gold") || additionals.includes("bip143"));
      // Inputs are provided as arrays of [transaction, output_index, optional redeem script, optional sequence]
      // associatedKeysets are provided as arrays of [path]
      var nullScript = Buffer.alloc(0);
      var nullPrevout = Buffer.alloc(0);
      var defaultVersion = Buffer.alloc(4);
      defaultVersion.writeUInt32LE(1, 0);
      var trustedInputs = [];
      var regularOutputs = [];
      var signatures = [];
      var publicKeys = [];
      var firstRun = true;
      var resuming = false;
      var targetTransaction = {
        inputs: [],
        version: defaultVersion,
        timestamp: Buffer.alloc(0)
      };
      var getTrustedInputCall = useBip143 ? this.getTrustedInputBIP143.bind(this) : this.getTrustedInput.bind(this);
      var outputScript = Buffer.from(outputScriptHex, "hex");

      return (0, _utils.foreach)(inputs, function (input) {
        return (0, _utils.doIf)(!resuming, function () {
          return getTrustedInputCall(input[1], input[0]).then(function (trustedInput) {
            var sequence = Buffer.alloc(4);
            sequence.writeUInt32LE(input.length >= 4 && typeof input[3] === "number" ? input[3] : DEFAULT_SEQUENCE, 0);
            trustedInputs.push({
              trustedInput: true,
              value: Buffer.from(trustedInput, "hex"),
              sequence: sequence
            });
          });
        }).then(function () {
          var outputs = input[0].outputs;

          var index = input[1];
          if (outputs && index <= outputs.length - 1) {
            regularOutputs.push(outputs[index]);
          }
        });
      }).then(function () {
        for (var i = 0; i < inputs.length; i++) {
          var _sequence = Buffer.alloc(4);
          _sequence.writeUInt32LE(inputs[i].length >= 4 && typeof inputs[i][3] === "number" ? inputs[i][3] : DEFAULT_SEQUENCE, 0);
          targetTransaction.inputs.push({
            script: nullScript,
            prevout: nullPrevout,
            sequence: _sequence
          });
        }
      }).then(function () {
        return (0, _utils.doIf)(!resuming, function () {
          return (
            // Collect public keys
            (0, _utils.foreach)(inputs, function (input, i) {
              return _this5.getWalletPublicKey_private(associatedKeysets[i], false, false);
            }).then(function (result) {
              for (var index = 0; index < result.length; index++) {
                publicKeys.push(_this5.compressPublicKey(Buffer.from(result[index].publicKey, "hex")));
              }
            })
          );
        });
      }).then(function () {
        if (hasTimestamp) {
          targetTransaction.timestamp = Buffer.alloc(4);
          targetTransaction.timestamp.writeUInt32LE(Math.floor(initialTimestamp + (Date.now() - startTime) / 1000), 0);
        }
      }).then(function () {
        return (0, _utils.doIf)(useBip143, function () {
          return (
            // Do the first run with all inputs
            _this5.startUntrustedHashTransactionInput(true, targetTransaction, trustedInputs, true).then(function () {
              return (0, _utils.doIf)(!resuming && typeof changePath != "undefined", function () {
                // $FlowFixMe
                return _this5.provideOutputFullChangePath(changePath);
              }).then(function () {
                return _this5.hashOutputFull(outputScript);
              });
            })
          );
        });
      }).then(function () {
        return (
          // Do the second run with the individual transaction
          (0, _utils.foreach)(inputs, function (input, i) {
            var script = inputs[i].length >= 3 && typeof inputs[i][2] === "string" ? Buffer.from(inputs[i][2], "hex") : !segwit ? regularOutputs[i].script : Buffer.concat([Buffer.from([OP_PUSHDATA1, OP_HASH160, HASH_SIZE]), _this5.hashPublicKey(publicKeys[i]), Buffer.from([OP_EQUALVERIFY, OP_CHECKSIG])]);
            var pseudoTX = (0, _assign2.default)({}, targetTransaction);
            var pseudoTrustedInputs = useBip143 ? [trustedInputs[i]] : trustedInputs;
            if (useBip143) {
              pseudoTX.inputs = [(0, _extends3.default)({}, pseudoTX.inputs[i], { script: script })];
            } else {
              pseudoTX.inputs[i].script = script;
            }
            return _this5.startUntrustedHashTransactionInput(!useBip143 && firstRun, pseudoTX, pseudoTrustedInputs, useBip143).then(function () {
              return (0, _utils.doIf)(!useBip143, function () {
                return (0, _utils.doIf)(!resuming && typeof changePath != "undefined", function () {
                  // $FlowFixMe
                  return _this5.provideOutputFullChangePath(changePath);
                }).then(function () {
                  return _this5.hashOutputFull(outputScript);
                });
              });
            }).then(function () {
              return _this5.signTransaction(associatedKeysets[i], lockTime, sigHashType);
            }).then(function (signature) {
              signatures.push(signature);
              targetTransaction.inputs[i].script = nullScript;
              if (firstRun) {
                firstRun = false;
              }
            });
          })
        );
      }).then(function () {
        // Populate the final input scripts
        for (var _i = 0; _i < inputs.length; _i++) {
          if (segwit) {
            targetTransaction.witness = Buffer.alloc(0);
            targetTransaction.inputs[_i].script = Buffer.concat([Buffer.from("160014", "hex"), _this5.hashPublicKey(publicKeys[_i])]);
          } else {
            var signatureSize = Buffer.alloc(1);
            var keySize = Buffer.alloc(1);
            signatureSize[0] = signatures[_i].length;
            keySize[0] = publicKeys[_i].length;
            targetTransaction.inputs[_i].script = Buffer.concat([signatureSize, signatures[_i], keySize, publicKeys[_i]]);
          }
          var offset = useBip143 ? 0 : 4;
          targetTransaction.inputs[_i].prevout = trustedInputs[_i].value.slice(offset, offset + 0x24);
        }

        var lockTimeBuffer = Buffer.alloc(4);
        lockTimeBuffer.writeUInt32LE(lockTime, 0);

        var result = Buffer.concat([_this5.serializeTransaction(targetTransaction, false, targetTransaction.timestamp), outputScript]);

        if (segwit) {
          var witness = Buffer.alloc(0);
          for (var i = 0; i < inputs.length; i++) {
            var tmpScriptData = Buffer.concat([Buffer.from("02", "hex"), Buffer.from([signatures[i].length]), signatures[i], Buffer.from([publicKeys[i].length]), publicKeys[i]]);
            witness = Buffer.concat([witness, tmpScriptData]);
          }
          result = Buffer.concat([result, witness]);
        }

        result = Buffer.concat([result, lockTimeBuffer]);

        return result.toString("hex");
      });
    }

    /**
     * To obtain the signature of multisignature (P2SH) inputs, call signP2SHTransaction_async with the folowing parameters
     * @param inputs is an array of [ transaction, output_index, redeem script, optional sequence ] where
     * * transaction is the previously computed transaction object for this UTXO
     * * output_index is the output in the transaction used as input for this UTXO (counting from 0)
     * * redeem script is the mandatory redeem script associated to the current P2SH input
     * * sequence is the sequence number to use for this input (when using RBF), or non present
     * @param associatedKeysets is an array of BIP 32 paths pointing to the path to the private key used for each UTXO
     * @param outputScriptHex is the hexadecimal serialized outputs of the transaction to sign
     * @param lockTime is the optional lockTime of the transaction to sign, or default (0)
     * @param sigHashType is the hash type of the transaction to sign, or default (all)
     * @return the signed transaction ready to be broadcast
     * @example
    btc.signP2SHTransaction(
    [ [tx, 1, "52210289b4a3ad52a919abd2bdd6920d8a6879b1e788c38aa76f0440a6f32a9f1996d02103a3393b1439d1693b063482c04bd40142db97bdf139eedd1b51ffb7070a37eac321030b9a409a1e476b0d5d17b804fcdb81cf30f9b99c6f3ae1178206e08bc500639853ae"] ],
    ["0'/0/0"],
    "01905f0100000000001976a91472a5d75c8d2d0565b656a5232703b167d50d5a2b88ac"
    ).then(result => ...);
     */

  }, {
    key: "signP2SHTransaction",
    value: function signP2SHTransaction(inputs, associatedKeysets, outputScriptHex) {
      var _this6 = this;

      var lockTime = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : DEFAULT_LOCKTIME;
      var sigHashType = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : SIGHASH_ALL;

      // Inputs are provided as arrays of [transaction, output_index, redeem script, optional sequence]
      // associatedKeysets are provided as arrays of [path]
      var nullScript = Buffer.alloc(0);
      var nullPrevout = Buffer.alloc(0);
      var defaultVersion = Buffer.alloc(4);
      defaultVersion.writeUInt32LE(1, 0);
      var trustedInputs = [];
      var regularOutputs = [];
      var signatures = [];
      var firstRun = true;
      var resuming = false;
      var targetTransaction = {
        inputs: [],
        version: defaultVersion
      };

      var outputScript = Buffer.from(outputScriptHex, "hex");

      return (0, _utils.foreach)(inputs, function (input) {
        return (0, _utils.doIf)(!resuming, function () {
          return _this6.getTrustedInput(input[1], input[0]).then(function (trustedInput) {
            var inputItem = {};
            inputItem.trustedInput = false;
            inputItem.value = Buffer.from(trustedInput, "hex").slice(4, 4 + 0x24);
            trustedInputs.push(inputItem);
          });
        }).then(function () {
          var outputs = input[0].outputs;

          var index = input[1];
          if (outputs && index <= outputs.length - 1) {
            regularOutputs.push(outputs[index]);
          }
        });
      }).then(function () {
        // Pre-build the target transaction
        for (var i = 0; i < inputs.length; i++) {
          var tmp = Buffer.alloc(4);
          var _sequence2 = void 0;
          if (inputs[i].length >= 4 && typeof inputs[i][3] === "number") {
            _sequence2 = inputs[i][3];
          } else {
            _sequence2 = DEFAULT_SEQUENCE;
          }
          tmp.writeUInt32LE(_sequence2, 0);
          targetTransaction.inputs.push({
            prevout: nullPrevout,
            script: nullScript,
            sequence: tmp
          });
        }
      }).then(function () {
        return (0, _utils.foreach)(inputs, function (input, i) {
          targetTransaction.inputs[i].script = inputs[i].length >= 3 && typeof inputs[i][2] === "string" ? Buffer.from(inputs[i][2], "hex") : regularOutputs[i].script;
          return _this6.startUntrustedHashTransactionInput(firstRun, targetTransaction, trustedInputs, false).then(function () {
            return _this6.hashOutputFull(outputScript);
          }).then(function () {
            return _this6.signTransaction(associatedKeysets[i], lockTime, sigHashType).then(function (signature) {
              signatures.push(signature.slice(0, signature.length - 1).toString("hex"));
              targetTransaction.inputs[i].script = nullScript;
              if (firstRun) {
                firstRun = false;
              }
            });
          });
        });
      }).then(function () {
        return signatures;
      });
    }
  }, {
    key: "compressPublicKey",
    value: function compressPublicKey(publicKey) {
      var prefix = (publicKey[64] & 1) !== 0 ? 0x03 : 0x02;
      var prefixBuffer = Buffer.alloc(1);
      prefixBuffer[0] = prefix;
      return Buffer.concat([prefixBuffer, publicKey.slice(1, 1 + 32)]);
    }
  }, {
    key: "createVarint",
    value: function createVarint(value) {
      if (value < 0xfd) {
        var _buffer = Buffer.alloc(1);
        _buffer[0] = value;
        return _buffer;
      }
      if (value <= 0xffff) {
        var _buffer2 = Buffer.alloc(3);
        _buffer2[0] = 0xfd;
        _buffer2[1] = value & 0xff;
        _buffer2[2] = value >> 8 & 0xff;
        return _buffer2;
      }
      var buffer = Buffer.alloc(5);
      buffer[0] = 0xfe;
      buffer[1] = value & 0xff;
      buffer[2] = value >> 8 & 0xff;
      buffer[3] = value >> 16 & 0xff;
      buffer[4] = value >> 24 & 0xff;
      return buffer;
    }

    /**
     * For each UTXO included in your transaction, create a transaction object from the raw serialized version of the transaction used in this UTXO.
     * @example
    const tx1 = btc.splitTransaction("01000000014ea60aeac5252c14291d428915bd7ccd1bfc4af009f4d4dc57ae597ed0420b71010000008a47304402201f36a12c240dbf9e566bc04321050b1984cd6eaf6caee8f02bb0bfec08e3354b022012ee2aeadcbbfd1e92959f57c15c1c6debb757b798451b104665aa3010569b49014104090b15bde569386734abf2a2b99f9ca6a50656627e77de663ca7325702769986cf26cc9dd7fdea0af432c8e2becc867c932e1b9dd742f2a108997c2252e2bdebffffffff0281b72e00000000001976a91472a5d75c8d2d0565b656a5232703b167d50d5a2b88aca0860100000000001976a9144533f5fb9b4817f713c48f0bfe96b9f50c476c9b88ac00000000");
     */

  }, {
    key: "splitTransaction",
    value: function splitTransaction(transactionHex) {
      var isSegwitSupported = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      var hasTimestamp = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

      var inputs = [];
      var outputs = [];
      var witness = false;
      var offset = 0;
      var timestamp = Buffer.alloc(0);
      var transaction = Buffer.from(transactionHex, "hex");
      var version = transaction.slice(offset, offset + 4);
      offset += 4;
      if (!hasTimestamp && isSegwitSupported && transaction[offset] === 0 && transaction[offset + 1] !== 0) {
        offset += 2;
        witness = true;
      }
      if (hasTimestamp) {
        timestamp = transaction.slice(offset, 4 + offset);
        offset += 4;
      }
      var varint = this.getVarint(transaction, offset);
      var numberInputs = varint[0];
      offset += varint[1];
      for (var i = 0; i < numberInputs; i++) {
        var _prevout = transaction.slice(offset, offset + 36);
        offset += 36;
        varint = this.getVarint(transaction, offset);
        offset += varint[1];
        var _script = transaction.slice(offset, offset + varint[0]);
        offset += varint[0];
        var _sequence3 = transaction.slice(offset, offset + 4);
        offset += 4;
        inputs.push({ prevout: _prevout, script: _script, sequence: _sequence3 });
      }
      varint = this.getVarint(transaction, offset);
      var numberOutputs = varint[0];
      offset += varint[1];
      for (var _i2 = 0; _i2 < numberOutputs; _i2++) {
        var _amount = transaction.slice(offset, offset + 8);
        offset += 8;
        varint = this.getVarint(transaction, offset);
        offset += varint[1];
        var _script2 = transaction.slice(offset, offset + varint[0]);
        offset += varint[0];
        outputs.push({ amount: _amount, script: _script2 });
      }
      var witnessScript, locktime;
      if (witness) {
        witnessScript = transaction.slice(offset, -4);
        locktime = transaction.slice(transaction.length - 4);
      } else {
        locktime = transaction.slice(offset, offset + 4);
      }
      return {
        version: version,
        inputs: inputs,
        outputs: outputs,
        locktime: locktime,
        witness: witnessScript,
        timestamp: timestamp
      };
    }

    /**
    @example
    const tx1 = btc.splitTransaction("01000000014ea60aeac5252c14291d428915bd7ccd1bfc4af009f4d4dc57ae597ed0420b71010000008a47304402201f36a12c240dbf9e566bc04321050b1984cd6eaf6caee8f02bb0bfec08e3354b022012ee2aeadcbbfd1e92959f57c15c1c6debb757b798451b104665aa3010569b49014104090b15bde569386734abf2a2b99f9ca6a50656627e77de663ca7325702769986cf26cc9dd7fdea0af432c8e2becc867c932e1b9dd742f2a108997c2252e2bdebffffffff0281b72e00000000001976a91472a5d75c8d2d0565b656a5232703b167d50d5a2b88aca0860100000000001976a9144533f5fb9b4817f713c48f0bfe96b9f50c476c9b88ac00000000");
    const outputScript = btc.serializeTransactionOutputs(tx1).toString('hex');
    */

  }, {
    key: "serializeTransactionOutputs",
    value: function serializeTransactionOutputs(_ref2) {
      var _this7 = this;

      var outputs = _ref2.outputs;

      var outputBuffer = Buffer.alloc(0);
      if (typeof outputs !== "undefined") {
        outputBuffer = Buffer.concat([outputBuffer, this.createVarint(outputs.length)]);
        outputs.forEach(function (output) {
          outputBuffer = Buffer.concat([outputBuffer, output.amount, _this7.createVarint(output.script.length), output.script]);
        });
      }
      return outputBuffer;
    }

    /**
     */

  }, {
    key: "serializeTransaction",
    value: function serializeTransaction(transaction, skipWitness, timestamp) {
      var _this8 = this;

      var inputBuffer = Buffer.alloc(0);
      var useWitness = typeof transaction["witness"] != "undefined" && !skipWitness;
      transaction.inputs.forEach(function (input) {
        inputBuffer = Buffer.concat([inputBuffer, input.prevout, _this8.createVarint(input.script.length), input.script, input.sequence]);
      });

      var outputBuffer = this.serializeTransactionOutputs(transaction);
      if (typeof transaction.outputs !== "undefined" && typeof transaction.locktime !== "undefined") {
        outputBuffer = Buffer.concat([outputBuffer, useWitness && transaction.witness || Buffer.alloc(0), transaction.locktime]);
      }

      return Buffer.concat([transaction.version, timestamp ? timestamp : Buffer.alloc(0), useWitness ? Buffer.from("0001", "hex") : Buffer.alloc(0), this.createVarint(transaction.inputs.length), inputBuffer, outputBuffer]);
    }

    /**
     */

  }, {
    key: "displayTransactionDebug",
    value: function displayTransactionDebug(transaction) {
      console.log("version " + transaction.version.toString("hex"));
      transaction.inputs.forEach(function (input, i) {
        var prevout = input.prevout.toString("hex");
        var script = input.script.toString("hex");
        var sequence = input.sequence.toString("hex");
        console.log("input " + i + " prevout " + prevout + " script " + script + " sequence " + sequence);
      });
      (transaction.outputs || []).forEach(function (output, i) {
        var amount = output.amount.toString("hex");
        var script = output.script.toString("hex");
        console.log("output " + i + " amount " + amount + " script " + script);
      });
      if (typeof transaction.locktime !== "undefined") {
        console.log("locktime " + transaction.locktime.toString("hex"));
      }
    }
  }]);
  return Btc;
}();

/**
 */

exports.default = Btc;

/**
 */

/**
 */


}).call(this,require("buffer").Buffer)
},{"./utils":2,"babel-runtime/core-js/object/assign":15,"babel-runtime/helpers/asyncToGenerator":24,"babel-runtime/helpers/classCallCheck":25,"babel-runtime/helpers/createClass":26,"babel-runtime/helpers/extends":27,"babel-runtime/regenerator":32,"buffer":121,"create-hash":553}],2:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isLedgerDevice = undefined;

var _promise = require("babel-runtime/core-js/promise");

var _promise2 = _interopRequireDefault(_promise);

exports.defer = defer;
exports.splitPath = splitPath;
exports.eachSeries = eachSeries;
exports.foreach = foreach;
exports.doIf = doIf;
exports.asyncWhile = asyncWhile;

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

function defer() {
  var resolve = void 0,
      reject = void 0;
  var promise = new _promise2.default(function (success, failure) {
    resolve = success;
    reject = failure;
  });
  if (!resolve || !reject) throw "defer() error"; // this never happens and is just to make flow happy
  return { promise: promise, resolve: resolve, reject: reject };
}

// TODO use bip32-path library
/********************************************************************************
 *   Ledger Node JS API
 *   (c) 2016-2017 Ledger
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/

function splitPath(path) {
  var result = [];
  var components = path.split("/");
  components.forEach(function (element) {
    var number = parseInt(element, 10);
    if (isNaN(number)) {
      return; // FIXME shouldn't it throws instead?
    }
    if (element.length > 1 && element[element.length - 1] === "'") {
      number += 0x80000000;
    }
    result.push(number);
  });
  return result;
}

// TODO use async await

function eachSeries(arr, fun) {
  return arr.reduce(function (p, e) {
    return p.then(function () {
      return fun(e);
    });
  }, _promise2.default.resolve());
}

function foreach(arr, callback) {
  function iterate(index, array, result) {
    if (index >= array.length) {
      return result;
    } else return callback(array[index], index).then(function (res) {
      result.push(res);
      return iterate(index + 1, array, result);
    });
  }
  return _promise2.default.resolve().then(function () {
    return iterate(0, arr, []);
  });
}

function doIf(condition, callback) {
  return _promise2.default.resolve().then(function () {
    if (condition) {
      return callback();
    }
  });
}

function asyncWhile(predicate, callback) {
  function iterate(result) {
    if (!predicate()) {
      return result;
    } else {
      return callback().then(function (res) {
        result.push(res);
        return iterate(result);
      });
    }
  }
  return _promise2.default.resolve([]).then(iterate);
}

var isLedgerDevice = exports.isLedgerDevice = function isLedgerDevice(device) {
  return device.vendorId === 0x2581 && device.productId === 0x3b7c || device.vendorId === 0x2c97;
};


},{"babel-runtime/core-js/promise":21}],3:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

var _utils = require("./utils");

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

/**
 * Ethereum API
 *
 * @example
 * import Eth from "@ledgerhq/hw-app-eth";
 * const eth = new Eth(transport)
 */
var Eth = function () {
  function Eth(transport) {
    (0, _classCallCheck3.default)(this, Eth);

    this.transport = transport;
    transport.decorateAppAPIMethods(this, ["getAddress", "signTransaction", "signPersonalMessage", "getAppConfiguration"], "w0w");
  }

  /**
   * get Ethereum address for a given BIP 32 path.
   * @param path a path in BIP 32 format
   * @option boolDisplay optionally enable or not the display
   * @option boolChaincode optionally enable or not the chaincode request
   * @return an object with a publicKey, address and (optionally) chainCode
   * @example
   * eth.getAddress("44'/60'/0'/0'/0").then(o => o.address)
   */

  (0, _createClass3.default)(Eth, [{
    key: "getAddress",
    value: function getAddress(path, boolDisplay, boolChaincode) {
      var paths = (0, _utils.splitPath)(path);
      var buffer = new Buffer(1 + paths.length * 4);
      buffer[0] = paths.length;
      paths.forEach(function (element, index) {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      return this.transport.send(0xe0, 0x02, boolDisplay ? 0x01 : 0x00, boolChaincode ? 0x01 : 0x00, buffer).then(function (response) {
        var result = {};
        var publicKeyLength = response[0];
        var addressLength = response[1 + publicKeyLength];
        result.publicKey = response.slice(1, 1 + publicKeyLength).toString("hex");
        result.address = "0x" + response.slice(1 + publicKeyLength + 1, 1 + publicKeyLength + 1 + addressLength).toString("ascii");
        if (boolChaincode) {
          result.chainCode = response.slice(1 + publicKeyLength + 1 + addressLength, 1 + publicKeyLength + 1 + addressLength + 32).toString("hex");
        }
        return result;
      });
    }

    /**
     * You can sign a transaction and retrieve v, r, s given the raw transaction and the BIP 32 path of the account to sign
     * @example
     eth.signTransaction("44'/60'/0'/0'/0", "e8018504e3b292008252089428ee52a8f3d6e5d15f8b131996950d7f296c7952872bd72a2487400080").then(result => ...)
     */

  }, {
    key: "signTransaction",
    value: function signTransaction(path, rawTxHex) {
      var _this = this;

      var paths = (0, _utils.splitPath)(path);
      var offset = 0;
      var rawTx = new Buffer(rawTxHex, "hex");
      var toSend = [];
      var response = void 0;

      var _loop = function _loop() {
        var maxChunkSize = offset === 0 ? 150 - 1 - paths.length * 4 : 150;
        var chunkSize = offset + maxChunkSize > rawTx.length ? rawTx.length - offset : maxChunkSize;
        var buffer = new Buffer(offset === 0 ? 1 + paths.length * 4 + chunkSize : chunkSize);
        if (offset === 0) {
          buffer[0] = paths.length;
          paths.forEach(function (element, index) {
            buffer.writeUInt32BE(element, 1 + 4 * index);
          });
          rawTx.copy(buffer, 1 + 4 * paths.length, offset, offset + chunkSize);
        } else {
          rawTx.copy(buffer, 0, offset, offset + chunkSize);
        }
        toSend.push(buffer);
        offset += chunkSize;
      };

      while (offset !== rawTx.length) {
        _loop();
      }
      return (0, _utils.foreach)(toSend, function (data, i) {
        return _this.transport.send(0xe0, 0x04, i === 0 ? 0x00 : 0x80, 0x00, data).then(function (apduResponse) {
          response = apduResponse;
        });
      }).then(function () {
        var v = response.slice(0, 1).toString("hex");
        var r = response.slice(1, 1 + 32).toString("hex");
        var s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
        return { v: v, r: r, s: s };
      });
    }

    /**
     */

  }, {
    key: "getAppConfiguration",
    value: function getAppConfiguration() {
      return this.transport.send(0xe0, 0x06, 0x00, 0x00).then(function (response) {
        var result = {};
        result.arbitraryDataEnabled = response[0] & 0x01;
        result.version = "" + response[1] + "." + response[2] + "." + response[3];
        return result;
      });
    }

    /**
    * You can sign a message according to eth_sign RPC call and retrieve v, r, s given the message and the BIP 32 path of the account to sign.
    * @example
    eth.signPersonalMessage("44'/60'/0'/0'/0", Buffer.from("test").toString("hex")).then(result => {
    var v = result['v'] - 27;
    v = v.toString(16);
    if (v.length < 2) {
      v = "0" + v;
    }
    console.log("Signature 0x" + result['r'] + result['s'] + v);
    })
     */

  }, {
    key: "signPersonalMessage",
    value: function signPersonalMessage(path, messageHex) {
      var _this2 = this;

      var paths = (0, _utils.splitPath)(path);
      var offset = 0;
      var message = new Buffer(messageHex, "hex");
      var toSend = [];
      var response = void 0;

      var _loop2 = function _loop2() {
        var maxChunkSize = offset === 0 ? 150 - 1 - paths.length * 4 - 4 : 150;
        var chunkSize = offset + maxChunkSize > message.length ? message.length - offset : maxChunkSize;
        var buffer = new Buffer(offset === 0 ? 1 + paths.length * 4 + 4 + chunkSize : chunkSize);
        if (offset === 0) {
          buffer[0] = paths.length;
          paths.forEach(function (element, index) {
            buffer.writeUInt32BE(element, 1 + 4 * index);
          });
          buffer.writeUInt32BE(message.length, 1 + 4 * paths.length);
          message.copy(buffer, 1 + 4 * paths.length + 4, offset, offset + chunkSize);
        } else {
          message.copy(buffer, 0, offset, offset + chunkSize);
        }
        toSend.push(buffer);
        offset += chunkSize;
      };

      while (offset !== message.length) {
        _loop2();
      }
      return (0, _utils.foreach)(toSend, function (data, i) {
        return _this2.transport.send(0xe0, 0x08, i === 0 ? 0x00 : 0x80, 0x00, data).then(function (apduResponse) {
          response = apduResponse;
        });
      }).then(function () {
        var v = response[0];
        var r = response.slice(1, 1 + 32).toString("hex");
        var s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
        return { v: v, r: r, s: s };
      });
    }
  }]);
  return Eth;
}(); /********************************************************************************
      *   Ledger Node JS API
      *   (c) 2016-2017 Ledger
      *
      *  Licensed under the Apache License, Version 2.0 (the "License");
      *  you may not use this file except in compliance with the License.
      *  You may obtain a copy of the License at
      *
      *      http://www.apache.org/licenses/LICENSE-2.0
      *
      *  Unless required by applicable law or agreed to in writing, software
      *  distributed under the License is distributed on an "AS IS" BASIS,
      *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
      *  See the License for the specific language governing permissions and
      *  limitations under the License.
      ********************************************************************************/

// FIXME drop:


exports.default = Eth;


}).call(this,require("buffer").Buffer)
},{"./utils":4,"babel-runtime/helpers/classCallCheck":25,"babel-runtime/helpers/createClass":26,"buffer":121}],4:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _promise = require("babel-runtime/core-js/promise");

var _promise2 = _interopRequireDefault(_promise);

exports.defer = defer;
exports.splitPath = splitPath;
exports.eachSeries = eachSeries;
exports.foreach = foreach;
exports.doIf = doIf;
exports.asyncWhile = asyncWhile;

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

function defer() {
  var resolve = void 0,
      reject = void 0;
  var promise = new _promise2.default(function (success, failure) {
    resolve = success;
    reject = failure;
  });
  if (!resolve || !reject) throw "defer() error"; // this never happens and is just to make flow happy
  return { promise: promise, resolve: resolve, reject: reject };
}

// TODO use bip32-path library
/********************************************************************************
 *   Ledger Node JS API
 *   (c) 2016-2017 Ledger
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/

function splitPath(path) {
  var result = [];
  var components = path.split("/");
  components.forEach(function (element) {
    var number = parseInt(element, 10);
    if (isNaN(number)) {
      return; // FIXME shouldn't it throws instead?
    }
    if (element.length > 1 && element[element.length - 1] === "'") {
      number += 0x80000000;
    }
    result.push(number);
  });
  return result;
}

// TODO use async await

function eachSeries(arr, fun) {
  return arr.reduce(function (p, e) {
    return p.then(function () {
      return fun(e);
    });
  }, _promise2.default.resolve());
}

function foreach(arr, callback) {
  function iterate(index, array, result) {
    if (index >= array.length) {
      return result;
    } else return callback(array[index], index).then(function (res) {
      result.push(res);
      return iterate(index + 1, array, result);
    });
  }
  return _promise2.default.resolve().then(function () {
    return iterate(0, arr, []);
  });
}

function doIf(condition, callback) {
  return _promise2.default.resolve().then(function () {
    if (condition) {
      return callback();
    }
  });
}

function asyncWhile(predicate, callback) {
  function iterate(result) {
    if (!predicate()) {
      return result;
    } else {
      return callback().then(function (res) {
        result.push(res);
        return iterate(result);
      });
    }
  }
  return _promise2.default.resolve([]).then(iterate);
}


},{"babel-runtime/core-js/promise":21}],5:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _promise = require("babel-runtime/core-js/promise");

var _promise2 = _interopRequireDefault(_promise);

var _typeof2 = require("babel-runtime/helpers/typeof");

var _typeof3 = _interopRequireDefault(_typeof2);

var _getPrototypeOf = require("babel-runtime/core-js/object/get-prototype-of");

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _regenerator = require("babel-runtime/regenerator");

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require("babel-runtime/helpers/asyncToGenerator");

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _possibleConstructorReturn2 = require("babel-runtime/helpers/possibleConstructorReturn");

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

var _inherits2 = require("babel-runtime/helpers/inherits");

var _inherits3 = _interopRequireDefault(_inherits2);

var _u2fApi = require("u2f-api");

var _hwTransport = require("@ledgerhq/hw-transport");

var _hwTransport2 = _interopRequireDefault(_hwTransport);

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

function wrapU2FTransportError(originalError, message, id) {
  var err = new _hwTransport.TransportError(message, id);
  // $FlowFixMe
  err.originalError = originalError;
  return err;
}

function wrapApdu(apdu, key) {
  var result = Buffer.alloc(apdu.length);
  for (var i = 0; i < apdu.length; i++) {
    result[i] = apdu[i] ^ key[i % key.length];
  }
  return result;
}

// Convert from normal to web-safe, strip trailing "="s
var webSafe64 = function webSafe64(base64) {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Convert from web-safe to normal, add trailing "="s
var normal64 = function normal64(base64) {
  return base64.replace(/-/g, "+").replace(/_/g, "/") + "==".substring(0, 3 * base64.length % 4);
};

function attemptExchange(apdu, timeoutMillis, debug, scrambleKey) {
  var keyHandle = wrapApdu(apdu, scrambleKey);
  var challenge = Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex");
  var signRequest = {
    version: "U2F_V2",
    keyHandle: webSafe64(keyHandle.toString("base64")),
    challenge: webSafe64(challenge.toString("base64")),
    appId: location.origin
  };
  if (debug) {
    console.log("=> " + apdu.toString("hex"));
  }
  return (0, _u2fApi.sign)(signRequest, timeoutMillis / 1000).then(function (response) {
    var signatureData = response.signatureData;

    if (typeof signatureData === "string") {
      var data = Buffer.from(normal64(signatureData), "base64");
      var result = data.slice(5);
      if (debug) {
        console.log("<= " + result.toString("hex"));
      }
      return result;
    } else {
      throw response;
    }
  });
}

var transportInstances = [];

function emitDisconnect() {
  transportInstances.forEach(function (t) {
    return t.emit("disconnect");
  });
  transportInstances = [];
}

function isTimeoutU2FError(u2fError) {
  return u2fError.metaData.code === 5;
}

/**
 * U2F web Transport implementation
 * @example
 * import TransportU2F from "@ledgerhq/hw-transport-u2f";
 * ...
 * TransportU2F.create().then(transport => ...)
 */

var TransportU2F = function (_Transport) {
  (0, _inherits3.default)(TransportU2F, _Transport);
  (0, _createClass3.default)(TransportU2F, null, [{
    key: "open",

    /**
     * static function to create a new Transport from a connected Ledger device discoverable via U2F (browser support)
     */
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(_) {
        var _openTimeout = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 5000;

        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                return _context.abrupt("return", new TransportU2F());

              case 1:
              case "end":
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function open(_x) {
        return _ref.apply(this, arguments);
      }

      return open;
    }()

    // this transport is not discoverable but we are going to guess if it is here with isSupported()

  }]);

  function TransportU2F() {
    (0, _classCallCheck3.default)(this, TransportU2F);

    var _this = (0, _possibleConstructorReturn3.default)(this, (TransportU2F.__proto__ || (0, _getPrototypeOf2.default)(TransportU2F)).call(this));

    transportInstances.push(_this);
    return _this;
  }

  (0, _createClass3.default)(TransportU2F, [{
    key: "exchange",
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(apdu) {
        var isU2FError;
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                _context2.prev = 0;
                _context2.next = 3;
                return attemptExchange(apdu, this.exchangeTimeout, this.debug, this.scrambleKey);

              case 3:
                return _context2.abrupt("return", _context2.sent);

              case 6:
                _context2.prev = 6;
                _context2.t0 = _context2["catch"](0);
                isU2FError = (0, _typeof3.default)(_context2.t0.metaData) === "object";

                if (!isU2FError) {
                  _context2.next = 14;
                  break;
                }

                if (isTimeoutU2FError(_context2.t0)) {
                  emitDisconnect();
                }
                // the wrapping make error more usable and "printable" to the end user.
                throw wrapU2FTransportError(_context2.t0, "Failed to sign with Ledger device: U2F " + _context2.t0.metaData.type, "U2F_" + _context2.t0.metaData.code);

              case 14:
                throw _context2.t0;

              case 15:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2, this, [[0, 6]]);
      }));

      function exchange(_x3) {
        return _ref2.apply(this, arguments);
      }

      return exchange;
    }()
  }, {
    key: "setScrambleKey",
    value: function setScrambleKey(scrambleKey) {
      this.scrambleKey = Buffer.from(scrambleKey, "ascii");
    }
  }, {
    key: "close",
    value: function close() {
      var i = transportInstances.indexOf(this);
      if (i === -1) {
        throw new Error("invalid transport instance");
      }
      transportInstances.splice(i, 1);
      return _promise2.default.resolve();
    }
  }]);
  return TransportU2F;
}(_hwTransport2.default);

TransportU2F.isSupported = _u2fApi.isSupported;

TransportU2F.list = function () {
  return (0, _u2fApi.isSupported)().then(function (supported) {
    return supported ? [null] : [];
  });
};

TransportU2F.listen = function (observer) {
  var unsubscribed = false;
  (0, _u2fApi.isSupported)().then(function (supported) {
    if (unsubscribed) return;
    if (supported) {
      observer.next({ type: "add", descriptor: null });
      observer.complete();
    } else {
      observer.error(new _hwTransport.TransportError("U2F browser support is needed for Ledger. " + "Please use Chrome, Opera or Firefox with a U2F extension. " + "Also make sure you're on an HTTPS connection", "U2FNotSupported"));
    }
  });
  return {
    unsubscribe: function unsubscribe() {
      unsubscribed = true;
    }
  };
};

exports.default = TransportU2F;


}).call(this,require("buffer").Buffer)
},{"@ledgerhq/hw-transport":6,"babel-runtime/core-js/object/get-prototype-of":18,"babel-runtime/core-js/promise":21,"babel-runtime/helpers/asyncToGenerator":24,"babel-runtime/helpers/classCallCheck":25,"babel-runtime/helpers/createClass":26,"babel-runtime/helpers/inherits":28,"babel-runtime/helpers/possibleConstructorReturn":29,"babel-runtime/helpers/typeof":31,"babel-runtime/regenerator":32,"buffer":121,"u2f-api":607}],6:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StatusCodes = undefined;

var _promise = require("babel-runtime/core-js/promise");

var _promise2 = _interopRequireDefault(_promise);

var _assign = require("babel-runtime/core-js/object/assign");

var _assign2 = _interopRequireDefault(_assign);

var _getIterator2 = require("babel-runtime/core-js/get-iterator");

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _toConsumableArray2 = require("babel-runtime/helpers/toConsumableArray");

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _regenerator = require("babel-runtime/regenerator");

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require("babel-runtime/helpers/asyncToGenerator");

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

var _keys = require("babel-runtime/core-js/object/keys");

var _keys2 = _interopRequireDefault(_keys);

exports.getAltStatusMessage = getAltStatusMessage;
exports.TransportError = TransportError;
exports.TransportStatusError = TransportStatusError;

var _events2 = require("events");

var _events3 = _interopRequireDefault(_events2);

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

/**
 * all possible status codes.
 * @see https://github.com/LedgerHQ/blue-app-btc/blob/d8a03d10f77ca5ef8b22a5d062678eef788b824a/include/btchip_apdu_constants.h#L85-L115
 * @example
 * import { StatusCodes } from "@ledgerhq/hw-transport";
 */

/**
 */

/**
 */

/**
 */

/**
 */
var StatusCodes = exports.StatusCodes = {
  PIN_REMAINING_ATTEMPTS: 0x63c0,
  INCORRECT_LENGTH: 0x6700,
  COMMAND_INCOMPATIBLE_FILE_STRUCTURE: 0x6981,
  SECURITY_STATUS_NOT_SATISFIED: 0x6982,
  CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
  INCORRECT_DATA: 0x6a80,
  NOT_ENOUGH_MEMORY_SPACE: 0x6a84,
  REFERENCED_DATA_NOT_FOUND: 0x6a88,
  FILE_ALREADY_EXISTS: 0x6a89,
  INCORRECT_P1_P2: 0x6b00,
  INS_NOT_SUPPORTED: 0x6d00,
  CLA_NOT_SUPPORTED: 0x6e00,
  TECHNICAL_PROBLEM: 0x6f00,
  OK: 0x9000,
  MEMORY_PROBLEM: 0x9240,
  NO_EF_SELECTED: 0x9400,
  INVALID_OFFSET: 0x9402,
  FILE_NOT_FOUND: 0x9404,
  INCONSISTENT_FILE: 0x9408,
  ALGORITHM_NOT_SUPPORTED: 0x9484,
  INVALID_KCV: 0x9485,
  CODE_NOT_INITIALIZED: 0x9802,
  ACCESS_CONDITION_NOT_FULFILLED: 0x9804,
  CONTRADICTION_SECRET_CODE_STATUS: 0x9808,
  CONTRADICTION_INVALIDATION: 0x9810,
  CODE_BLOCKED: 0x9840,
  MAX_VALUE_REACHED: 0x9850,
  GP_AUTH_FAILED: 0x6300,
  LICENSING: 0x6f42,
  HALTED: 0x6faa
};

function getAltStatusMessage(code) {
  switch (code) {
    // improve text of most common errors
    case 0x6700:
      return "Incorrect length";
    case 0x6982:
      return "Security not satisfied (dongle locked or have invalid access rights)";
    case 0x6985:
      return "Condition of use not satisfied (denied by the user?)";
    case 0x6a80:
      return "Invalid data received";
    case 0x6b00:
      return "Invalid parameter received";
  }
  if (0x6f00 <= code && code <= 0x6fff) {
    return "Internal error, please report";
  }
}

/**
 * TransportError is used for any generic transport errors.
 * e.g. Error thrown when data received by exchanges are incorrect or if exchanged failed to communicate with the device for various reason.
 */
function TransportError(message, id) {
  this.name = "TransportError";
  this.message = message;
  this.stack = new Error().stack;
  this.id = id;
}
//$FlowFixMe
TransportError.prototype = new Error();

/**
 * Error thrown when a device returned a non success status.
 * the error.statusCode is one of the `StatusCodes` exported by this library.
 */
function TransportStatusError(statusCode) {
  this.name = "TransportStatusError";
  var statusText = (0, _keys2.default)(StatusCodes).find(function (k) {
    return StatusCodes[k] === statusCode;
  }) || "UNKNOWN_ERROR";
  var smsg = getAltStatusMessage(statusCode) || statusText;
  var statusCodeStr = statusCode.toString(16);
  this.message = "Ledger device: " + smsg + " (0x" + statusCodeStr + ")";
  this.stack = new Error().stack;
  this.statusCode = statusCode;
  this.statusText = statusText;
}
//$FlowFixMe
TransportStatusError.prototype = new Error();

/**
 * Transport defines the generic interface to share between node/u2f impl
 * A **Descriptor** is a parametric type that is up to be determined for the implementation.
 * it can be for instance an ID, an file path, a URL,...
 */

var Transport = function () {
  function Transport() {
    var _this = this;

    (0, _classCallCheck3.default)(this, Transport);
    this.debug = null;
    this.exchangeTimeout = 30000;
    this._events = new _events3.default();

    this.send = function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(cla, ins, p1, p2) {
        var data = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : Buffer.alloc(0);
        var statusList = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : [StatusCodes.OK];
        var response, sw;
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                if (!(data.length >= 256)) {
                  _context.next = 2;
                  break;
                }

                throw new TransportError("data.length exceed 256 bytes limit. Got: " + data.length, "DataLengthTooBig");

              case 2:
                _context.next = 4;
                return _this.exchange(Buffer.concat([Buffer.from([cla, ins, p1, p2]), Buffer.from([data.length]), data]));

              case 4:
                response = _context.sent;
                sw = response.readUInt16BE(response.length - 2);

                if (statusList.some(function (s) {
                  return s === sw;
                })) {
                  _context.next = 8;
                  break;
                }

                throw new TransportStatusError(sw);

              case 8:
                return _context.abrupt("return", response);

              case 9:
              case "end":
                return _context.stop();
            }
          }
        }, _callee, _this);
      }));

      return function (_x, _x2, _x3, _x4) {
        return _ref.apply(this, arguments);
      };
    }();

    this._appAPIlock = null;
  }

  /**
   * Statically check if a transport is supported on the user's platform/browser.
   */

  /**
   * List once all available descriptors. For a better granularity, checkout `listen()`.
   * @return a promise of descriptors
   * @example
   * TransportFoo.list().then(descriptors => ...)
   */

  /**
   * Listen all device events for a given Transport. The method takes an Obverver of DescriptorEvent and returns a Subscription (according to Observable paradigm https://github.com/tc39/proposal-observable )
   * a DescriptorEvent is a `{ descriptor, type }` object. type can be `"add"` or `"remove"` and descriptor is a value you can pass to `open(descriptor)`.
   * each listen() call will first emit all potential device already connected and then will emit events can come over times,
   * for instance if you plug a USB device after listen() or a bluetooth device become discoverable.
   * @param observer is an object with a next, error and complete function (compatible with observer pattern)
   * @return a Subscription object on which you can `.unsubscribe()` to stop listening descriptors.
   * @example
  const sub = TransportFoo.listen({
  next: e => {
    if (e.type==="add") {
      sub.unsubscribe();
      const transport = await TransportFoo.open(e.descriptor);
      ...
    }
  },
  error: error => {},
  complete: () => {}
  })
   */

  /**
   * attempt to create a Transport instance with potentially a descriptor.
   * @param descriptor: the descriptor to open the transport with.
   * @param timeout: an optional timeout
   * @return a Promise of Transport instance
   * @example
  TransportFoo.open(descriptor).then(transport => ...)
   */

  /**
   * low level api to communicate with the device
   * This method is for implementations to implement but should not be directly called.
   * Instead, the recommanded way is to use send() method
   * @param apdu the data to send
   * @return a Promise of response data
   */

  /**
   * set the "scramble key" for the next exchanges with the device.
   * Each App can have a different scramble key and they internally will set it at instanciation.
   * @param key the scramble key
   */

  /**
   * close the exchange with the device.
   * @return a Promise that ends when the transport is closed.
   */

  (0, _createClass3.default)(Transport, [{
    key: "on",

    /**
     * Listen to an event on an instance of transport.
     * Transport implementation can have specific events. Here is the common events:
     * * `"disconnect"` : triggered if Transport is disconnected
     */
    value: function on(eventName, cb) {
      this._events.on(eventName, cb);
    }

    /**
     * Stop listening to an event on an instance of transport.
     */

  }, {
    key: "off",
    value: function off(eventName, cb) {
      this._events.removeListener(eventName, cb);
    }
  }, {
    key: "emit",
    value: function emit(event) {
      var _events;

      for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
      }

      (_events = this._events).emit.apply(_events, [event].concat((0, _toConsumableArray3.default)(args)));
    }

    /**
     * Enable or not logs of the binary exchange
     */

  }, {
    key: "setDebugMode",
    value: function setDebugMode(debug) {
      this.debug = typeof debug === "function" ? debug : debug ? function (log) {
        return console.log(log);
      } : null;
    }

    /**
     * Set a timeout (in milliseconds) for the exchange call. Only some transport might implement it. (e.g. U2F)
     */

  }, {
    key: "setExchangeTimeout",
    value: function setExchangeTimeout(exchangeTimeout) {
      this.exchangeTimeout = exchangeTimeout;
    }

    /**
     * wrapper on top of exchange to simplify work of the implementation.
     * @param cla
     * @param ins
     * @param p1
     * @param p2
     * @param data
     * @param statusList is a list of accepted status code (shorts). [0x9000] by default
     * @return a Promise of response buffer
     */

  }, {
    key: "decorateAppAPIMethods",
    value: function decorateAppAPIMethods(self, methods, scrambleKey) {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = (0, _getIterator3.default)(methods), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var methodName = _step.value;

          self[methodName] = this.decorateAppAPIMethod(methodName, self[methodName], self, scrambleKey);
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }
  }, {
    key: "decorateAppAPIMethod",
    value: function decorateAppAPIMethod(methodName, f, ctx, scrambleKey) {
      var _this2 = this;

      return function () {
        var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2() {
          for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
            args[_key2] = arguments[_key2];
          }

          var _appAPIlock, _e;

          return _regenerator2.default.wrap(function _callee2$(_context2) {
            while (1) {
              switch (_context2.prev = _context2.next) {
                case 0:
                  _appAPIlock = _this2._appAPIlock;

                  if (!_appAPIlock) {
                    _context2.next = 5;
                    break;
                  }

                  _e = new TransportError("Ledger Device is busy (lock " + _appAPIlock + ")", "TransportLocked");

                  (0, _assign2.default)(_e, {
                    currentLock: _appAPIlock,
                    methodName: methodName
                  });
                  return _context2.abrupt("return", _promise2.default.reject(_e));

                case 5:
                  _context2.prev = 5;

                  _this2._appAPIlock = methodName;
                  _this2.setScrambleKey(scrambleKey);
                  _context2.next = 10;
                  return f.apply(ctx, args);

                case 10:
                  return _context2.abrupt("return", _context2.sent);

                case 11:
                  _context2.prev = 11;

                  _this2._appAPIlock = null;
                  return _context2.finish(11);

                case 14:
                case "end":
                  return _context2.stop();
              }
            }
          }, _callee2, _this2, [[5,, 11, 14]]);
        }));

        return function () {
          return _ref2.apply(this, arguments);
        };
      }();
    }
  }], [{
    key: "create",

    /**
     * create() allows to open the first descriptor available or
     * throw if there is none or if timeout is reached.
     * This is a light helper, alternative to using listen() and open() (that you may need for any more advanced usecase)
     * @example
    TransportFoo.create().then(transport => ...)
     */
    value: function create() {
      var _this3 = this;

      var openTimeout = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 3000;
      var listenTimeout = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 10000;

      return new _promise2.default(function (resolve, reject) {
        var found = false;
        var listenTimeoutId = setTimeout(function () {
          sub.unsubscribe();
          reject(new TransportError(_this3.ErrorMessage_ListenTimeout, "ListenTimeout"));
        }, listenTimeout);
        var sub = _this3.listen({
          next: function next(e) {
            found = true;
            sub.unsubscribe();
            clearTimeout(listenTimeoutId);
            _this3.open(e.descriptor, openTimeout).then(resolve, reject);
          },
          error: function error(e) {
            clearTimeout(listenTimeoutId);
            reject(e);
          },
          complete: function complete() {
            clearTimeout(listenTimeoutId);
            if (!found) {
              reject(new TransportError(_this3.ErrorMessage_NoDeviceFound, "NoDeviceFound"));
            }
          }
        });
      });
    }
  }]);
  return Transport;
}();

Transport.ErrorMessage_ListenTimeout = "No Ledger device found (timeout)";
Transport.ErrorMessage_NoDeviceFound = "No Ledger device found";
exports.default = Transport;


}).call(this,require("buffer").Buffer)
},{"babel-runtime/core-js/get-iterator":14,"babel-runtime/core-js/object/assign":15,"babel-runtime/core-js/object/keys":19,"babel-runtime/core-js/promise":21,"babel-runtime/helpers/asyncToGenerator":24,"babel-runtime/helpers/classCallCheck":25,"babel-runtime/helpers/createClass":26,"babel-runtime/helpers/toConsumableArray":30,"babel-runtime/regenerator":32,"buffer":121,"events":562}],7:[function(require,module,exports){
(function (global){
'use strict';

// compare and isBuffer taken from https://github.com/feross/buffer/blob/680e9e5e488f22aac27599a57dc844a6315928dd/index.js
// original notice:

/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

function compare(a, b) {
  if (a === b) {
    return 0;
  }

  var x = a.length;
  var y = b.length;

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break;
    }
  }

  if (x < y) {
    return -1;
  }
  if (y < x) {
    return 1;
  }
  return 0;
}
function isBuffer(b) {
  if (global.Buffer && typeof global.Buffer.isBuffer === 'function') {
    return global.Buffer.isBuffer(b);
  }
  return !!(b != null && b._isBuffer);
}

// based on node assert, original notice:

// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

var util = require('util/');
var hasOwn = Object.prototype.hasOwnProperty;
var pSlice = Array.prototype.slice;
var functionsHaveNames = function () {
  return function foo() {}.name === 'foo';
}();
function pToString(obj) {
  return Object.prototype.toString.call(obj);
}
function isView(arrbuf) {
  if (isBuffer(arrbuf)) {
    return false;
  }
  if (typeof global.ArrayBuffer !== 'function') {
    return false;
  }
  if (typeof ArrayBuffer.isView === 'function') {
    return ArrayBuffer.isView(arrbuf);
  }
  if (!arrbuf) {
    return false;
  }
  if (arrbuf instanceof DataView) {
    return true;
  }
  if (arrbuf.buffer && arrbuf.buffer instanceof ArrayBuffer) {
    return true;
  }
  return false;
}
// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

var regex = /\s*function\s+([^\(\s]*)\s*/;
// based on https://github.com/ljharb/function.prototype.name/blob/adeeeec8bfcc6068b187d7d9fb3d5bb1d3a30899/implementation.js
function getName(func) {
  if (!util.isFunction(func)) {
    return;
  }
  if (functionsHaveNames) {
    return func.name;
  }
  var str = func.toString();
  var match = str.match(regex);
  return match && match[1];
}
assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  } else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = getName(stackStartFunction);
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function truncate(s, n) {
  if (typeof s === 'string') {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}
function inspect(something) {
  if (functionsHaveNames || !util.isFunction(something)) {
    return util.inspect(something);
  }
  var rawname = getName(something);
  var name = rawname ? ': ' + rawname : '';
  return '[Function' + name + ']';
}
function getMessage(self) {
  return truncate(inspect(self.actual), 128) + ' ' + self.operator + ' ' + truncate(inspect(self.expected), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected, false)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

assert.deepStrictEqual = function deepStrictEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected, true)) {
    fail(actual, expected, message, 'deepStrictEqual', assert.deepStrictEqual);
  }
};

function _deepEqual(actual, expected, strict, memos) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;
  } else if (isBuffer(actual) && isBuffer(expected)) {
    return compare(actual, expected) === 0;

    // 7.2. If the expected value is a Date object, the actual value is
    // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

    // 7.3 If the expected value is a RegExp object, the actual value is
    // equivalent if it is also a RegExp object with the same source and
    // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source && actual.global === expected.global && actual.multiline === expected.multiline && actual.lastIndex === expected.lastIndex && actual.ignoreCase === expected.ignoreCase;

    // 7.4. Other pairs that do not both pass typeof value == 'object',
    // equivalence is determined by ==.
  } else if ((actual === null || (typeof actual === 'undefined' ? 'undefined' : _typeof(actual)) !== 'object') && (expected === null || (typeof expected === 'undefined' ? 'undefined' : _typeof(expected)) !== 'object')) {
    return strict ? actual === expected : actual == expected;

    // If both values are instances of typed arrays, wrap their underlying
    // ArrayBuffers in a Buffer each to increase performance
    // This optimization requires the arrays to have the same type as checked by
    // Object.prototype.toString (aka pToString). Never perform binary
    // comparisons for Float*Arrays, though, since e.g. +0 === -0 but their
    // bit patterns are not identical.
  } else if (isView(actual) && isView(expected) && pToString(actual) === pToString(expected) && !(actual instanceof Float32Array || actual instanceof Float64Array)) {
    return compare(new Uint8Array(actual.buffer), new Uint8Array(expected.buffer)) === 0;

    // 7.5 For all other Object pairs, including Array objects, equivalence is
    // determined by having the same number of owned properties (as verified
    // with Object.prototype.hasOwnProperty.call), the same set of keys
    // (although not necessarily the same order), equivalent values for every
    // corresponding key, and an identical 'prototype' property. Note: this
    // accounts for both named and indexed properties on Arrays.
  } else if (isBuffer(actual) !== isBuffer(expected)) {
    return false;
  } else {
    memos = memos || { actual: [], expected: [] };

    var actualIndex = memos.actual.indexOf(actual);
    if (actualIndex !== -1) {
      if (actualIndex === memos.expected.indexOf(expected)) {
        return true;
      }
    }

    memos.actual.push(actual);
    memos.expected.push(expected);

    return objEquiv(actual, expected, strict, memos);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b, strict, actualVisitedObjects) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  // if one is a primitive, the other must be same
  if (util.isPrimitive(a) || util.isPrimitive(b)) return a === b;
  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  var aIsArgs = isArguments(a);
  var bIsArgs = isArguments(b);
  if (aIsArgs && !bIsArgs || !aIsArgs && bIsArgs) return false;
  if (aIsArgs) {
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b, strict);
  }
  var ka = objectKeys(a);
  var kb = objectKeys(b);
  var key, i;
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length !== kb.length) return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] !== kb[i]) return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key], strict, actualVisitedObjects)) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected, false)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

assert.notDeepStrictEqual = notDeepStrictEqual;
function notDeepStrictEqual(actual, expected, message) {
  if (_deepEqual(actual, expected, true)) {
    fail(actual, expected, message, 'notDeepStrictEqual', notDeepStrictEqual);
  }
}

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  }

  try {
    if (actual instanceof expected) {
      return true;
    }
  } catch (e) {
    // Ignore.  The instanceof check doesn't work for arrow functions.
  }

  if (Error.isPrototypeOf(expected)) {
    return false;
  }

  return expected.call({}, actual) === true;
}

function _tryBlock(block) {
  var error;
  try {
    block();
  } catch (e) {
    error = e;
  }
  return error;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (typeof block !== 'function') {
    throw new TypeError('"block" argument must be a function');
  }

  if (typeof expected === 'string') {
    message = expected;
    expected = null;
  }

  actual = _tryBlock(block);

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') + (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  var userProvidedMessage = typeof message === 'string';
  var isUnwantedException = !shouldThrow && util.isError(actual);
  var isUnexpectedException = !shouldThrow && actual && !expected;

  if (isUnwantedException && userProvidedMessage && expectedException(actual, expected) || isUnexpectedException) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if (shouldThrow && actual && expected && !expectedException(actual, expected) || !shouldThrow && actual) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function (block, /*optional*/error, /*optional*/message) {
  _throws(true, block, error, message);
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function (block, /*optional*/error, /*optional*/message) {
  _throws(false, block, error, message);
};

assert.ifError = function (err) {
  if (err) throw err;
};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"util/":10}],8:[function(require,module,exports){
'use strict';

if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor;
    var TempCtor = function TempCtor() {};
    TempCtor.prototype = superCtor.prototype;
    ctor.prototype = new TempCtor();
    ctor.prototype.constructor = ctor;
  };
}

},{}],9:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

module.exports = function isBuffer(arg) {
  return arg && (typeof arg === 'undefined' ? 'undefined' : _typeof(arg)) === 'object' && typeof arg.copy === 'function' && typeof arg.fill === 'function' && typeof arg.readUInt8 === 'function';
};

},{}],10:[function(require,module,exports){
(function (process,global){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function (f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function (x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s':
        return String(args[i++]);
      case '%d':
        return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};

// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function (fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function () {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};

var debugs = {};
var debugEnviron;
exports.debuglog = function (set) {
  if (isUndefined(debugEnviron)) debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function () {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function () {};
    }
  }
  return debugs[set];
};

/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;

// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold': [1, 22],
  'italic': [3, 23],
  'underline': [4, 24],
  'inverse': [7, 27],
  'white': [37, 39],
  'grey': [90, 39],
  'black': [30, 39],
  'blue': [34, 39],
  'cyan': [36, 39],
  'green': [32, 39],
  'magenta': [35, 39],
  'red': [31, 39],
  'yellow': [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};

function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\x1B[' + inspect.colors[style][0] + 'm' + str + '\x1B[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}

function stylizeNoColor(str, styleType) {
  return str;
}

function arrayToHash(array) {
  var hash = {};

  array.forEach(function (val, idx) {
    hash[val] = true;
  });

  return hash;
}

function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect && value && isFunction(value.inspect) &&
  // Filter out the util module, it's inspect function is special
  value.inspect !== exports.inspect &&
  // Also filter out any prototype objects using the circular check.
  !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value) && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '',
      array = false,
      braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function (key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}

function formatPrimitive(ctx, value) {
  if (isUndefined(value)) return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '').replace(/'/g, "\\'").replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value)) return ctx.stylize('' + value, 'number');
  if (isBoolean(value)) return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value)) return ctx.stylize('null', 'null');
}

function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}

function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys, String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function (key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys, key, true));
    }
  });
  return output;
}

function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function (line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function (line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'").replace(/\\"/g, '"').replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}

function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function (prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] + (base === '' ? '' : base + '\n ') + ' ' + output.join(',\n  ') + ' ' + braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return (typeof arg === 'undefined' ? 'undefined' : _typeof(arg)) === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return (typeof arg === 'undefined' ? 'undefined' : _typeof(arg)) === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) && (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null || typeof arg === 'boolean' || typeof arg === 'number' || typeof arg === 'string' || (typeof arg === 'undefined' ? 'undefined' : _typeof(arg)) === 'symbol' || // ES6 symbol
  typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function () {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};

/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function (origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":9,"_process":572,"inherits":8}],11:[function(require,module,exports){
(function (global){
"use strict";

require("core-js/shim");

require("regenerator-runtime/runtime");

require("core-js/fn/regexp/escape");

if (global._babelPolyfill) {
  throw new Error("only one instance of babel-polyfill is allowed");
}
global._babelPolyfill = true;

var DEFINE_PROPERTY = "defineProperty";
function define(O, key, value) {
  O[key] || Object[DEFINE_PROPERTY](O, key, {
    writable: true,
    configurable: true,
    value: value
  });
}

define(String.prototype, "padLeft", "".padStart);
define(String.prototype, "padRight", "".padEnd);

"pop,reverse,shift,keys,values,entries,indexOf,every,some,forEach,map,filter,find,findIndex,includes,join,slice,concat,push,splice,unshift,sort,lastIndexOf,reduce,reduceRight,copyWithin,fill".split(",").forEach(function (key) {
  [][key] && define(Array, key, Function.call.bind([][key]));
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"core-js/fn/regexp/escape":123,"core-js/shim":551,"regenerator-runtime/runtime":12}],12:[function(require,module,exports){
(function (global){
"use strict";

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/**
 * Copyright (c) 2014, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * https://raw.github.com/facebook/regenerator/master/LICENSE file. An
 * additional grant of patent rights can be found in the PATENTS file in
 * the same directory.
 */

!function (global) {
  "use strict";

  var Op = Object.prototype;
  var hasOwn = Op.hasOwnProperty;
  var undefined; // More compressible than void 0.
  var $Symbol = typeof Symbol === "function" ? Symbol : {};
  var iteratorSymbol = $Symbol.iterator || "@@iterator";
  var asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator";
  var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";

  var inModule = (typeof module === "undefined" ? "undefined" : _typeof(module)) === "object";
  var runtime = global.regeneratorRuntime;
  if (runtime) {
    if (inModule) {
      // If regeneratorRuntime is defined globally and we're in a module,
      // make the exports object identical to regeneratorRuntime.
      module.exports = runtime;
    }
    // Don't bother evaluating the rest of this file if the runtime was
    // already defined globally.
    return;
  }

  // Define the runtime globally (as expected by generated code) as either
  // module.exports (if we're in a module) or a new, empty object.
  runtime = global.regeneratorRuntime = inModule ? module.exports : {};

  function wrap(innerFn, outerFn, self, tryLocsList) {
    // If outerFn provided and outerFn.prototype is a Generator, then outerFn.prototype instanceof Generator.
    var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
    var generator = Object.create(protoGenerator.prototype);
    var context = new Context(tryLocsList || []);

    // The ._invoke method unifies the implementations of the .next,
    // .throw, and .return methods.
    generator._invoke = makeInvokeMethod(innerFn, self, context);

    return generator;
  }
  runtime.wrap = wrap;

  // Try/catch helper to minimize deoptimizations. Returns a completion
  // record like context.tryEntries[i].completion. This interface could
  // have been (and was previously) designed to take a closure to be
  // invoked without arguments, but in all the cases we care about we
  // already have an existing method we want to call, so there's no need
  // to create a new function object. We can even get away with assuming
  // the method takes exactly one argument, since that happens to be true
  // in every case, so we don't have to touch the arguments object. The
  // only additional allocation required is the completion record, which
  // has a stable shape and so hopefully should be cheap to allocate.
  function tryCatch(fn, obj, arg) {
    try {
      return { type: "normal", arg: fn.call(obj, arg) };
    } catch (err) {
      return { type: "throw", arg: err };
    }
  }

  var GenStateSuspendedStart = "suspendedStart";
  var GenStateSuspendedYield = "suspendedYield";
  var GenStateExecuting = "executing";
  var GenStateCompleted = "completed";

  // Returning this object from the innerFn has the same effect as
  // breaking out of the dispatch switch statement.
  var ContinueSentinel = {};

  // Dummy constructor functions that we use as the .constructor and
  // .constructor.prototype properties for functions that return Generator
  // objects. For full spec compliance, you may wish to configure your
  // minifier not to mangle the names of these two functions.
  function Generator() {}
  function GeneratorFunction() {}
  function GeneratorFunctionPrototype() {}

  // This is a polyfill for %IteratorPrototype% for environments that
  // don't natively support it.
  var IteratorPrototype = {};
  IteratorPrototype[iteratorSymbol] = function () {
    return this;
  };

  var getProto = Object.getPrototypeOf;
  var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
  if (NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol)) {
    // This environment has a native %IteratorPrototype%; use it instead
    // of the polyfill.
    IteratorPrototype = NativeIteratorPrototype;
  }

  var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype);
  GeneratorFunction.prototype = Gp.constructor = GeneratorFunctionPrototype;
  GeneratorFunctionPrototype.constructor = GeneratorFunction;
  GeneratorFunctionPrototype[toStringTagSymbol] = GeneratorFunction.displayName = "GeneratorFunction";

  // Helper for defining the .next, .throw, and .return methods of the
  // Iterator interface in terms of a single ._invoke method.
  function defineIteratorMethods(prototype) {
    ["next", "throw", "return"].forEach(function (method) {
      prototype[method] = function (arg) {
        return this._invoke(method, arg);
      };
    });
  }

  runtime.isGeneratorFunction = function (genFun) {
    var ctor = typeof genFun === "function" && genFun.constructor;
    return ctor ? ctor === GeneratorFunction ||
    // For the native GeneratorFunction constructor, the best we can
    // do is to check its .name property.
    (ctor.displayName || ctor.name) === "GeneratorFunction" : false;
  };

  runtime.mark = function (genFun) {
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
    } else {
      genFun.__proto__ = GeneratorFunctionPrototype;
      if (!(toStringTagSymbol in genFun)) {
        genFun[toStringTagSymbol] = "GeneratorFunction";
      }
    }
    genFun.prototype = Object.create(Gp);
    return genFun;
  };

  // Within the body of any async function, `await x` is transformed to
  // `yield regeneratorRuntime.awrap(x)`, so that the runtime can test
  // `hasOwn.call(value, "__await")` to determine if the yielded value is
  // meant to be awaited.
  runtime.awrap = function (arg) {
    return { __await: arg };
  };

  function AsyncIterator(generator) {
    function invoke(method, arg, resolve, reject) {
      var record = tryCatch(generator[method], generator, arg);
      if (record.type === "throw") {
        reject(record.arg);
      } else {
        var result = record.arg;
        var value = result.value;
        if (value && (typeof value === "undefined" ? "undefined" : _typeof(value)) === "object" && hasOwn.call(value, "__await")) {
          return Promise.resolve(value.__await).then(function (value) {
            invoke("next", value, resolve, reject);
          }, function (err) {
            invoke("throw", err, resolve, reject);
          });
        }

        return Promise.resolve(value).then(function (unwrapped) {
          // When a yielded Promise is resolved, its final value becomes
          // the .value of the Promise<{value,done}> result for the
          // current iteration. If the Promise is rejected, however, the
          // result for this iteration will be rejected with the same
          // reason. Note that rejections of yielded Promises are not
          // thrown back into the generator function, as is the case
          // when an awaited Promise is rejected. This difference in
          // behavior between yield and await is important, because it
          // allows the consumer to decide what to do with the yielded
          // rejection (swallow it and continue, manually .throw it back
          // into the generator, abandon iteration, whatever). With
          // await, by contrast, there is no opportunity to examine the
          // rejection reason outside the generator function, so the
          // only option is to throw it from the await expression, and
          // let the generator function handle the exception.
          result.value = unwrapped;
          resolve(result);
        }, reject);
      }
    }

    if (_typeof(global.process) === "object" && global.process.domain) {
      invoke = global.process.domain.bind(invoke);
    }

    var previousPromise;

    function enqueue(method, arg) {
      function callInvokeWithMethodAndArg() {
        return new Promise(function (resolve, reject) {
          invoke(method, arg, resolve, reject);
        });
      }

      return previousPromise =
      // If enqueue has been called before, then we want to wait until
      // all previous Promises have been resolved before calling invoke,
      // so that results are always delivered in the correct order. If
      // enqueue has not been called before, then it is important to
      // call invoke immediately, without waiting on a callback to fire,
      // so that the async generator function has the opportunity to do
      // any necessary setup in a predictable way. This predictability
      // is why the Promise constructor synchronously invokes its
      // executor callback, and why async functions synchronously
      // execute code before the first await. Since we implement simple
      // async functions in terms of async generators, it is especially
      // important to get this right, even though it requires care.
      previousPromise ? previousPromise.then(callInvokeWithMethodAndArg,
      // Avoid propagating failures to Promises returned by later
      // invocations of the iterator.
      callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg();
    }

    // Define the unified helper method that is used to implement .next,
    // .throw, and .return (see defineIteratorMethods).
    this._invoke = enqueue;
  }

  defineIteratorMethods(AsyncIterator.prototype);
  AsyncIterator.prototype[asyncIteratorSymbol] = function () {
    return this;
  };
  runtime.AsyncIterator = AsyncIterator;

  // Note that simple async functions are implemented on top of
  // AsyncIterator objects; they just return a Promise for the value of
  // the final result produced by the iterator.
  runtime.async = function (innerFn, outerFn, self, tryLocsList) {
    var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList));

    return runtime.isGeneratorFunction(outerFn) ? iter // If outerFn is a generator, return the full iterator.
    : iter.next().then(function (result) {
      return result.done ? result.value : iter.next();
    });
  };

  function makeInvokeMethod(innerFn, self, context) {
    var state = GenStateSuspendedStart;

    return function invoke(method, arg) {
      if (state === GenStateExecuting) {
        throw new Error("Generator is already running");
      }

      if (state === GenStateCompleted) {
        if (method === "throw") {
          throw arg;
        }

        // Be forgiving, per 25.3.3.3.3 of the spec:
        // https://people.mozilla.org/~jorendorff/es6-draft.html#sec-generatorresume
        return doneResult();
      }

      context.method = method;
      context.arg = arg;

      while (true) {
        var delegate = context.delegate;
        if (delegate) {
          var delegateResult = maybeInvokeDelegate(delegate, context);
          if (delegateResult) {
            if (delegateResult === ContinueSentinel) continue;
            return delegateResult;
          }
        }

        if (context.method === "next") {
          // Setting context._sent for legacy support of Babel's
          // function.sent implementation.
          context.sent = context._sent = context.arg;
        } else if (context.method === "throw") {
          if (state === GenStateSuspendedStart) {
            state = GenStateCompleted;
            throw context.arg;
          }

          context.dispatchException(context.arg);
        } else if (context.method === "return") {
          context.abrupt("return", context.arg);
        }

        state = GenStateExecuting;

        var record = tryCatch(innerFn, self, context);
        if (record.type === "normal") {
          // If an exception is thrown from innerFn, we leave state ===
          // GenStateExecuting and loop back for another invocation.
          state = context.done ? GenStateCompleted : GenStateSuspendedYield;

          if (record.arg === ContinueSentinel) {
            continue;
          }

          return {
            value: record.arg,
            done: context.done
          };
        } else if (record.type === "throw") {
          state = GenStateCompleted;
          // Dispatch the exception by looping back around to the
          // context.dispatchException(context.arg) call above.
          context.method = "throw";
          context.arg = record.arg;
        }
      }
    };
  }

  // Call delegate.iterator[context.method](context.arg) and handle the
  // result, either by returning a { value, done } result from the
  // delegate iterator, or by modifying context.method and context.arg,
  // setting context.delegate to null, and returning the ContinueSentinel.
  function maybeInvokeDelegate(delegate, context) {
    var method = delegate.iterator[context.method];
    if (method === undefined) {
      // A .throw or .return when the delegate iterator has no .throw
      // method always terminates the yield* loop.
      context.delegate = null;

      if (context.method === "throw") {
        if (delegate.iterator.return) {
          // If the delegate iterator has a return method, give it a
          // chance to clean up.
          context.method = "return";
          context.arg = undefined;
          maybeInvokeDelegate(delegate, context);

          if (context.method === "throw") {
            // If maybeInvokeDelegate(context) changed context.method from
            // "return" to "throw", let that override the TypeError below.
            return ContinueSentinel;
          }
        }

        context.method = "throw";
        context.arg = new TypeError("The iterator does not provide a 'throw' method");
      }

      return ContinueSentinel;
    }

    var record = tryCatch(method, delegate.iterator, context.arg);

    if (record.type === "throw") {
      context.method = "throw";
      context.arg = record.arg;
      context.delegate = null;
      return ContinueSentinel;
    }

    var info = record.arg;

    if (!info) {
      context.method = "throw";
      context.arg = new TypeError("iterator result is not an object");
      context.delegate = null;
      return ContinueSentinel;
    }

    if (info.done) {
      // Assign the result of the finished delegate to the temporary
      // variable specified by delegate.resultName (see delegateYield).
      context[delegate.resultName] = info.value;

      // Resume execution at the desired location (see delegateYield).
      context.next = delegate.nextLoc;

      // If context.method was "throw" but the delegate handled the
      // exception, let the outer generator proceed normally. If
      // context.method was "next", forget context.arg since it has been
      // "consumed" by the delegate iterator. If context.method was
      // "return", allow the original .return call to continue in the
      // outer generator.
      if (context.method !== "return") {
        context.method = "next";
        context.arg = undefined;
      }
    } else {
      // Re-yield the result returned by the delegate method.
      return info;
    }

    // The delegate iterator is finished, so forget it and continue with
    // the outer generator.
    context.delegate = null;
    return ContinueSentinel;
  }

  // Define Generator.prototype.{next,throw,return} in terms of the
  // unified ._invoke helper method.
  defineIteratorMethods(Gp);

  Gp[toStringTagSymbol] = "Generator";

  // A Generator should always return itself as the iterator object when the
  // @@iterator function is called on it. Some browsers' implementations of the
  // iterator prototype chain incorrectly implement this, causing the Generator
  // object to not be returned from this call. This ensures that doesn't happen.
  // See https://github.com/facebook/regenerator/issues/274 for more details.
  Gp[iteratorSymbol] = function () {
    return this;
  };

  Gp.toString = function () {
    return "[object Generator]";
  };

  function pushTryEntry(locs) {
    var entry = { tryLoc: locs[0] };

    if (1 in locs) {
      entry.catchLoc = locs[1];
    }

    if (2 in locs) {
      entry.finallyLoc = locs[2];
      entry.afterLoc = locs[3];
    }

    this.tryEntries.push(entry);
  }

  function resetTryEntry(entry) {
    var record = entry.completion || {};
    record.type = "normal";
    delete record.arg;
    entry.completion = record;
  }

  function Context(tryLocsList) {
    // The root entry object (effectively a try statement without a catch
    // or a finally block) gives us a place to store values thrown from
    // locations where there is no enclosing try statement.
    this.tryEntries = [{ tryLoc: "root" }];
    tryLocsList.forEach(pushTryEntry, this);
    this.reset(true);
  }

  runtime.keys = function (object) {
    var keys = [];
    for (var key in object) {
      keys.push(key);
    }
    keys.reverse();

    // Rather than returning an object with a next method, we keep
    // things simple and return the next function itself.
    return function next() {
      while (keys.length) {
        var key = keys.pop();
        if (key in object) {
          next.value = key;
          next.done = false;
          return next;
        }
      }

      // To avoid creating an additional object, we just hang the .value
      // and .done properties off the next function object itself. This
      // also ensures that the minifier will not anonymize the function.
      next.done = true;
      return next;
    };
  };

  function values(iterable) {
    if (iterable) {
      var iteratorMethod = iterable[iteratorSymbol];
      if (iteratorMethod) {
        return iteratorMethod.call(iterable);
      }

      if (typeof iterable.next === "function") {
        return iterable;
      }

      if (!isNaN(iterable.length)) {
        var i = -1,
            next = function next() {
          while (++i < iterable.length) {
            if (hasOwn.call(iterable, i)) {
              next.value = iterable[i];
              next.done = false;
              return next;
            }
          }

          next.value = undefined;
          next.done = true;

          return next;
        };

        return next.next = next;
      }
    }

    // Return an iterator with no values.
    return { next: doneResult };
  }
  runtime.values = values;

  function doneResult() {
    return { value: undefined, done: true };
  }

  Context.prototype = {
    constructor: Context,

    reset: function reset(skipTempReset) {
      this.prev = 0;
      this.next = 0;
      // Resetting context._sent for legacy support of Babel's
      // function.sent implementation.
      this.sent = this._sent = undefined;
      this.done = false;
      this.delegate = null;

      this.method = "next";
      this.arg = undefined;

      this.tryEntries.forEach(resetTryEntry);

      if (!skipTempReset) {
        for (var name in this) {
          // Not sure about the optimal order of these conditions:
          if (name.charAt(0) === "t" && hasOwn.call(this, name) && !isNaN(+name.slice(1))) {
            this[name] = undefined;
          }
        }
      }
    },

    stop: function stop() {
      this.done = true;

      var rootEntry = this.tryEntries[0];
      var rootRecord = rootEntry.completion;
      if (rootRecord.type === "throw") {
        throw rootRecord.arg;
      }

      return this.rval;
    },

    dispatchException: function dispatchException(exception) {
      if (this.done) {
        throw exception;
      }

      var context = this;
      function handle(loc, caught) {
        record.type = "throw";
        record.arg = exception;
        context.next = loc;

        if (caught) {
          // If the dispatched exception was caught by a catch block,
          // then let that catch block handle the exception normally.
          context.method = "next";
          context.arg = undefined;
        }

        return !!caught;
      }

      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        var record = entry.completion;

        if (entry.tryLoc === "root") {
          // Exception thrown outside of any try block that could handle
          // it, so set the completion value of the entire function to
          // throw the exception.
          return handle("end");
        }

        if (entry.tryLoc <= this.prev) {
          var hasCatch = hasOwn.call(entry, "catchLoc");
          var hasFinally = hasOwn.call(entry, "finallyLoc");

          if (hasCatch && hasFinally) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            } else if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }
          } else if (hasCatch) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            }
          } else if (hasFinally) {
            if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }
          } else {
            throw new Error("try statement without catch or finally");
          }
        }
      }
    },

    abrupt: function abrupt(type, arg) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) {
          var finallyEntry = entry;
          break;
        }
      }

      if (finallyEntry && (type === "break" || type === "continue") && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc) {
        // Ignore the finally entry if control is not jumping to a
        // location outside the try/catch block.
        finallyEntry = null;
      }

      var record = finallyEntry ? finallyEntry.completion : {};
      record.type = type;
      record.arg = arg;

      if (finallyEntry) {
        this.method = "next";
        this.next = finallyEntry.finallyLoc;
        return ContinueSentinel;
      }

      return this.complete(record);
    },

    complete: function complete(record, afterLoc) {
      if (record.type === "throw") {
        throw record.arg;
      }

      if (record.type === "break" || record.type === "continue") {
        this.next = record.arg;
      } else if (record.type === "return") {
        this.rval = this.arg = record.arg;
        this.method = "return";
        this.next = "end";
      } else if (record.type === "normal" && afterLoc) {
        this.next = afterLoc;
      }

      return ContinueSentinel;
    },

    finish: function finish(finallyLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.finallyLoc === finallyLoc) {
          this.complete(entry.completion, entry.afterLoc);
          resetTryEntry(entry);
          return ContinueSentinel;
        }
      }
    },

    "catch": function _catch(tryLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc === tryLoc) {
          var record = entry.completion;
          if (record.type === "throw") {
            var thrown = record.arg;
            resetTryEntry(entry);
          }
          return thrown;
        }
      }

      // The context.catch method must only be called with a location
      // argument that corresponds to a known catch block.
      throw new Error("illegal catch attempt");
    },

    delegateYield: function delegateYield(iterable, resultName, nextLoc) {
      this.delegate = {
        iterator: values(iterable),
        resultName: resultName,
        nextLoc: nextLoc
      };

      if (this.method === "next") {
        // Deliberately forget the last sent value so that we don't
        // accidentally pass it on to the delegate.
        this.arg = undefined;
      }

      return ContinueSentinel;
    }
  };
}(
// Among the various tricks for obtaining a reference to the global
// object, this seems to be the most reliable technique that does not
// use indirect eval (which violates Content Security Policy).
(typeof global === "undefined" ? "undefined" : _typeof(global)) === "object" ? global : (typeof window === "undefined" ? "undefined" : _typeof(window)) === "object" ? window : (typeof self === "undefined" ? "undefined" : _typeof(self)) === "object" ? self : undefined);

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],13:[function(require,module,exports){
"use strict";

module.exports = { "default": require("core-js/library/fn/array/from"), __esModule: true };

},{"core-js/library/fn/array/from":124}],14:[function(require,module,exports){
"use strict";

module.exports = { "default": require("core-js/library/fn/get-iterator"), __esModule: true };

},{"core-js/library/fn/get-iterator":125}],15:[function(require,module,exports){
"use strict";

module.exports = { "default": require("core-js/library/fn/object/assign"), __esModule: true };

},{"core-js/library/fn/object/assign":126}],16:[function(require,module,exports){
"use strict";

module.exports = { "default": require("core-js/library/fn/object/create"), __esModule: true };

},{"core-js/library/fn/object/create":127}],17:[function(require,module,exports){
"use strict";

module.exports = { "default": require("core-js/library/fn/object/define-property"), __esModule: true };

},{"core-js/library/fn/object/define-property":128}],18:[function(require,module,exports){
"use strict";

module.exports = { "default": require("core-js/library/fn/object/get-prototype-of"), __esModule: true };

},{"core-js/library/fn/object/get-prototype-of":129}],19:[function(require,module,exports){
"use strict";

module.exports = { "default": require("core-js/library/fn/object/keys"), __esModule: true };

},{"core-js/library/fn/object/keys":130}],20:[function(require,module,exports){
"use strict";

module.exports = { "default": require("core-js/library/fn/object/set-prototype-of"), __esModule: true };

},{"core-js/library/fn/object/set-prototype-of":131}],21:[function(require,module,exports){
"use strict";

module.exports = { "default": require("core-js/library/fn/promise"), __esModule: true };

},{"core-js/library/fn/promise":132}],22:[function(require,module,exports){
"use strict";

module.exports = { "default": require("core-js/library/fn/symbol"), __esModule: true };

},{"core-js/library/fn/symbol":133}],23:[function(require,module,exports){
"use strict";

module.exports = { "default": require("core-js/library/fn/symbol/iterator"), __esModule: true };

},{"core-js/library/fn/symbol/iterator":134}],24:[function(require,module,exports){
"use strict";

exports.__esModule = true;

var _promise = require("../core-js/promise");

var _promise2 = _interopRequireDefault(_promise);

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

exports.default = function (fn) {
  return function () {
    var gen = fn.apply(this, arguments);
    return new _promise2.default(function (resolve, reject) {
      function step(key, arg) {
        try {
          var info = gen[key](arg);
          var value = info.value;
        } catch (error) {
          reject(error);
          return;
        }

        if (info.done) {
          resolve(value);
        } else {
          return _promise2.default.resolve(value).then(function (value) {
            step("next", value);
          }, function (err) {
            step("throw", err);
          });
        }
      }

      return step("next");
    });
  };
};

},{"../core-js/promise":21}],25:[function(require,module,exports){
"use strict";

exports.__esModule = true;

exports.default = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};

},{}],26:[function(require,module,exports){
"use strict";

exports.__esModule = true;

var _defineProperty = require("../core-js/object/define-property");

var _defineProperty2 = _interopRequireDefault(_defineProperty);

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

exports.default = function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      (0, _defineProperty2.default)(target, descriptor.key, descriptor);
    }
  }

  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
}();

},{"../core-js/object/define-property":17}],27:[function(require,module,exports){
"use strict";

exports.__esModule = true;

var _assign = require("../core-js/object/assign");

var _assign2 = _interopRequireDefault(_assign);

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

exports.default = _assign2.default || function (target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];

    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key];
      }
    }
  }

  return target;
};

},{"../core-js/object/assign":15}],28:[function(require,module,exports){
"use strict";

exports.__esModule = true;

var _setPrototypeOf = require("../core-js/object/set-prototype-of");

var _setPrototypeOf2 = _interopRequireDefault(_setPrototypeOf);

var _create = require("../core-js/object/create");

var _create2 = _interopRequireDefault(_create);

var _typeof2 = require("../helpers/typeof");

var _typeof3 = _interopRequireDefault(_typeof2);

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

exports.default = function (subClass, superClass) {
  if (typeof superClass !== "function" && superClass !== null) {
    throw new TypeError("Super expression must either be null or a function, not " + (typeof superClass === "undefined" ? "undefined" : (0, _typeof3.default)(superClass)));
  }

  subClass.prototype = (0, _create2.default)(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
  if (superClass) _setPrototypeOf2.default ? (0, _setPrototypeOf2.default)(subClass, superClass) : subClass.__proto__ = superClass;
};

},{"../core-js/object/create":16,"../core-js/object/set-prototype-of":20,"../helpers/typeof":31}],29:[function(require,module,exports){
"use strict";

exports.__esModule = true;

var _typeof2 = require("../helpers/typeof");

var _typeof3 = _interopRequireDefault(_typeof2);

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

exports.default = function (self, call) {
  if (!self) {
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  }

  return call && ((typeof call === "undefined" ? "undefined" : (0, _typeof3.default)(call)) === "object" || typeof call === "function") ? call : self;
};

},{"../helpers/typeof":31}],30:[function(require,module,exports){
"use strict";

exports.__esModule = true;

var _from = require("../core-js/array/from");

var _from2 = _interopRequireDefault(_from);

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

exports.default = function (arr) {
  if (Array.isArray(arr)) {
    for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) {
      arr2[i] = arr[i];
    }

    return arr2;
  } else {
    return (0, _from2.default)(arr);
  }
};

},{"../core-js/array/from":13}],31:[function(require,module,exports){
"use strict";

var _typeof2 = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.__esModule = true;

var _iterator = require("../core-js/symbol/iterator");

var _iterator2 = _interopRequireDefault(_iterator);

var _symbol = require("../core-js/symbol");

var _symbol2 = _interopRequireDefault(_symbol);

var _typeof = typeof _symbol2.default === "function" && _typeof2(_iterator2.default) === "symbol" ? function (obj) {
  return typeof obj === "undefined" ? "undefined" : _typeof2(obj);
} : function (obj) {
  return obj && typeof _symbol2.default === "function" && obj.constructor === _symbol2.default && obj !== _symbol2.default.prototype ? "symbol" : typeof obj === "undefined" ? "undefined" : _typeof2(obj);
};

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

exports.default = typeof _symbol2.default === "function" && _typeof(_iterator2.default) === "symbol" ? function (obj) {
  return typeof obj === "undefined" ? "undefined" : _typeof(obj);
} : function (obj) {
  return obj && typeof _symbol2.default === "function" && obj.constructor === _symbol2.default && obj !== _symbol2.default.prototype ? "symbol" : typeof obj === "undefined" ? "undefined" : _typeof(obj);
};

},{"../core-js/symbol":22,"../core-js/symbol/iterator":23}],32:[function(require,module,exports){
"use strict";

module.exports = require("regenerator-runtime");

},{"regenerator-runtime":588}],33:[function(require,module,exports){
'use strict';

// base-x encoding
// Forked from https://github.com/cryptocoinjs/bs58
// Originally written by Mike Hearn for BitcoinJ
// Copyright (c) 2011 Google Inc
// Ported to JavaScript by Stefan Thomas
// Merged Buffer refactorings from base58-native by Stephen Pair
// Copyright (c) 2013 BitPay Inc

var Buffer = require('safe-buffer').Buffer;

module.exports = function base(ALPHABET) {
  var ALPHABET_MAP = {};
  var BASE = ALPHABET.length;
  var LEADER = ALPHABET.charAt(0);

  // pre-compute lookup table
  for (var z = 0; z < ALPHABET.length; z++) {
    var x = ALPHABET.charAt(z);

    if (ALPHABET_MAP[x] !== undefined) throw new TypeError(x + ' is ambiguous');
    ALPHABET_MAP[x] = z;
  }

  function encode(source) {
    if (source.length === 0) return '';

    var digits = [0];
    for (var i = 0; i < source.length; ++i) {
      for (var j = 0, carry = source[i]; j < digits.length; ++j) {
        carry += digits[j] << 8;
        digits[j] = carry % BASE;
        carry = carry / BASE | 0;
      }

      while (carry > 0) {
        digits.push(carry % BASE);
        carry = carry / BASE | 0;
      }
    }

    var string = '';

    // deal with leading zeros
    for (var k = 0; source[k] === 0 && k < source.length - 1; ++k) {
      string += LEADER;
    } // convert digits to a string
    for (var q = digits.length - 1; q >= 0; --q) {
      string += ALPHABET[digits[q]];
    }return string;
  }

  function decodeUnsafe(string) {
    if (typeof string !== 'string') throw new TypeError('Expected String');
    if (string.length === 0) return Buffer.allocUnsafe(0);

    var bytes = [0];
    for (var i = 0; i < string.length; i++) {
      var value = ALPHABET_MAP[string[i]];
      if (value === undefined) return;

      for (var j = 0, carry = value; j < bytes.length; ++j) {
        carry += bytes[j] * BASE;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }

      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }

    // deal with leading zeros
    for (var k = 0; string[k] === LEADER && k < string.length - 1; ++k) {
      bytes.push(0);
    }

    return Buffer.from(bytes.reverse());
  }

  function decode(string) {
    var buffer = decodeUnsafe(string);
    if (buffer) return buffer;

    throw new Error('Non-base' + BASE + ' character');
  }

  return {
    encode: encode,
    decodeUnsafe: decodeUnsafe,
    decode: decode
  };
};

},{"safe-buffer":591}],34:[function(require,module,exports){
'use strict';

exports.byteLength = byteLength;
exports.toByteArray = toByteArray;
exports.fromByteArray = fromByteArray;

var lookup = [];
var revLookup = [];
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i];
  revLookup[code.charCodeAt(i)] = i;
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62;
revLookup['_'.charCodeAt(0)] = 63;

function getLens(b64) {
  var len = b64.length;

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4');
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=');
  if (validLen === -1) validLen = len;

  var placeHoldersLen = validLen === len ? 0 : 4 - validLen % 4;

  return [validLen, placeHoldersLen];
}

// base64 is 4/3 + up to two characters of the original data
function byteLength(b64) {
  var lens = getLens(b64);
  var validLen = lens[0];
  var placeHoldersLen = lens[1];
  return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
}

function _byteLength(b64, validLen, placeHoldersLen) {
  return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
}

function toByteArray(b64) {
  var tmp;
  var lens = getLens(b64);
  var validLen = lens[0];
  var placeHoldersLen = lens[1];

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));

  var curByte = 0;

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0 ? validLen - 4 : validLen;

  for (var i = 0; i < len; i += 4) {
    tmp = revLookup[b64.charCodeAt(i)] << 18 | revLookup[b64.charCodeAt(i + 1)] << 12 | revLookup[b64.charCodeAt(i + 2)] << 6 | revLookup[b64.charCodeAt(i + 3)];
    arr[curByte++] = tmp >> 16 & 0xFF;
    arr[curByte++] = tmp >> 8 & 0xFF;
    arr[curByte++] = tmp & 0xFF;
  }

  if (placeHoldersLen === 2) {
    tmp = revLookup[b64.charCodeAt(i)] << 2 | revLookup[b64.charCodeAt(i + 1)] >> 4;
    arr[curByte++] = tmp & 0xFF;
  }

  if (placeHoldersLen === 1) {
    tmp = revLookup[b64.charCodeAt(i)] << 10 | revLookup[b64.charCodeAt(i + 1)] << 4 | revLookup[b64.charCodeAt(i + 2)] >> 2;
    arr[curByte++] = tmp >> 8 & 0xFF;
    arr[curByte++] = tmp & 0xFF;
  }

  return arr;
}

function tripletToBase64(num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F];
}

function encodeChunk(uint8, start, end) {
  var tmp;
  var output = [];
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16 & 0xFF0000) + (uint8[i + 1] << 8 & 0xFF00) + (uint8[i + 2] & 0xFF);
    output.push(tripletToBase64(tmp));
  }
  return output.join('');
}

function fromByteArray(uint8) {
  var tmp;
  var len = uint8.length;
  var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
  var parts = [];
  var maxChunkLength = 16383; // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, i + maxChunkLength > len2 ? len2 : i + maxChunkLength));
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1];
    parts.push(lookup[tmp >> 2] + lookup[tmp << 4 & 0x3F] + '==');
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1];
    parts.push(lookup[tmp >> 10] + lookup[tmp >> 4 & 0x3F] + lookup[tmp << 2 & 0x3F] + '=');
  }

  return parts.join('');
}

},{}],35:[function(require,module,exports){
'use strict';

var ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

// pre-compute lookup table
var ALPHABET_MAP = {};
for (var z = 0; z < ALPHABET.length; z++) {
  var x = ALPHABET.charAt(z);

  if (ALPHABET_MAP[x] !== undefined) throw new TypeError(x + ' is ambiguous');
  ALPHABET_MAP[x] = z;
}

function polymodStep(pre) {
  var b = pre >> 25;
  return (pre & 0x1FFFFFF) << 5 ^ -(b >> 0 & 1) & 0x3b6a57b2 ^ -(b >> 1 & 1) & 0x26508e6d ^ -(b >> 2 & 1) & 0x1ea119fa ^ -(b >> 3 & 1) & 0x3d4233dd ^ -(b >> 4 & 1) & 0x2a1462b3;
}

function prefixChk(prefix) {
  var chk = 1;
  for (var i = 0; i < prefix.length; ++i) {
    var c = prefix.charCodeAt(i);
    if (c < 33 || c > 126) throw new Error('Invalid prefix (' + prefix + ')');

    chk = polymodStep(chk) ^ c >> 5;
  }
  chk = polymodStep(chk);

  for (i = 0; i < prefix.length; ++i) {
    var v = prefix.charCodeAt(i);
    chk = polymodStep(chk) ^ v & 0x1f;
  }
  return chk;
}

function encode(prefix, words, LIMIT) {
  LIMIT = LIMIT || 90;
  if (prefix.length + 7 + words.length > LIMIT) throw new TypeError('Exceeds length limit');

  prefix = prefix.toLowerCase();

  // determine chk mod
  var chk = prefixChk(prefix);
  var result = prefix + '1';
  for (var i = 0; i < words.length; ++i) {
    var x = words[i];
    if (x >> 5 !== 0) throw new Error('Non 5-bit word');

    chk = polymodStep(chk) ^ x;
    result += ALPHABET.charAt(x);
  }

  for (i = 0; i < 6; ++i) {
    chk = polymodStep(chk);
  }
  chk ^= 1;

  for (i = 0; i < 6; ++i) {
    var v = chk >> (5 - i) * 5 & 0x1f;
    result += ALPHABET.charAt(v);
  }

  return result;
}

function decode(str, LIMIT) {
  LIMIT = LIMIT || 90;
  if (str.length < 8) throw new TypeError(str + ' too short');
  if (str.length > LIMIT) throw new TypeError('Exceeds length limit');

  // don't allow mixed case
  var lowered = str.toLowerCase();
  var uppered = str.toUpperCase();
  if (str !== lowered && str !== uppered) throw new Error('Mixed-case string ' + str);
  str = lowered;

  var split = str.lastIndexOf('1');
  if (split === -1) throw new Error('No separator character for ' + str);
  if (split === 0) throw new Error('Missing prefix for ' + str);

  var prefix = str.slice(0, split);
  var wordChars = str.slice(split + 1);
  if (wordChars.length < 6) throw new Error('Data too short');

  var chk = prefixChk(prefix);
  var words = [];
  for (var i = 0; i < wordChars.length; ++i) {
    var c = wordChars.charAt(i);
    var v = ALPHABET_MAP[c];
    if (v === undefined) throw new Error('Unknown character ' + c);
    chk = polymodStep(chk) ^ v;

    // not in the checksum?
    if (i + 6 >= wordChars.length) continue;
    words.push(v);
  }

  if (chk !== 1) throw new Error('Invalid checksum for ' + str);
  return { prefix: prefix, words: words };
}

function convert(data, inBits, outBits, pad) {
  var value = 0;
  var bits = 0;
  var maxV = (1 << outBits) - 1;

  var result = [];
  for (var i = 0; i < data.length; ++i) {
    value = value << inBits | data[i];
    bits += inBits;

    while (bits >= outBits) {
      bits -= outBits;
      result.push(value >> bits & maxV);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push(value << outBits - bits & maxV);
    }
  } else {
    if (bits >= inBits) throw new Error('Excess padding');
    if (value << outBits - bits & maxV) throw new Error('Non-zero padding');
  }

  return result;
}

function toWords(bytes) {
  return convert(bytes, 8, 5, true);
}

function fromWords(words) {
  return convert(words, 5, 8, false);
}

module.exports = {
  decode: decode,
  encode: encode,
  toWords: toWords,
  fromWords: fromWords
};

},{}],36:[function(require,module,exports){
"use strict";

// (public) Constructor
function BigInteger(a, b, c) {
  if (!(this instanceof BigInteger)) return new BigInteger(a, b, c);

  if (a != null) {
    if ("number" == typeof a) this.fromNumber(a, b, c);else if (b == null && "string" != typeof a) this.fromString(a, 256);else this.fromString(a, b);
  }
}

var proto = BigInteger.prototype;

// duck-typed isBigInteger
proto.__bigi = require('../package.json').version;
BigInteger.isBigInteger = function (obj, check_ver) {
  return obj && obj.__bigi && (!check_ver || obj.__bigi === proto.__bigi);
};

// Bits per digit
var dbits;

// am: Compute w_j += (x*this_i), propagate carries,
// c is initial carry, returns final carry.
// c < 3*dvalue, x < 2*dvalue, this_i < dvalue
// We need to select the fastest one that works in this environment.

// am1: use a single mult and divide to get the high bits,
// max digit bits should be 26 because
// max internal value = 2*dvalue^2-2*dvalue (< 2^53)
function am1(i, x, w, j, c, n) {
  while (--n >= 0) {
    var v = x * this[i++] + w[j] + c;
    c = Math.floor(v / 0x4000000);
    w[j++] = v & 0x3ffffff;
  }
  return c;
}
// am2 avoids a big mult-and-extract completely.
// Max digit bits should be <= 30 because we do bitwise ops
// on values up to 2*hdvalue^2-hdvalue-1 (< 2^31)
function am2(i, x, w, j, c, n) {
  var xl = x & 0x7fff,
      xh = x >> 15;
  while (--n >= 0) {
    var l = this[i] & 0x7fff;
    var h = this[i++] >> 15;
    var m = xh * l + h * xl;
    l = xl * l + ((m & 0x7fff) << 15) + w[j] + (c & 0x3fffffff);
    c = (l >>> 30) + (m >>> 15) + xh * h + (c >>> 30);
    w[j++] = l & 0x3fffffff;
  }
  return c;
}
// Alternately, set max digit bits to 28 since some
// browsers slow down when dealing with 32-bit numbers.
function am3(i, x, w, j, c, n) {
  var xl = x & 0x3fff,
      xh = x >> 14;
  while (--n >= 0) {
    var l = this[i] & 0x3fff;
    var h = this[i++] >> 14;
    var m = xh * l + h * xl;
    l = xl * l + ((m & 0x3fff) << 14) + w[j] + c;
    c = (l >> 28) + (m >> 14) + xh * h;
    w[j++] = l & 0xfffffff;
  }
  return c;
}

// wtf?
BigInteger.prototype.am = am1;
dbits = 26;

BigInteger.prototype.DB = dbits;
BigInteger.prototype.DM = (1 << dbits) - 1;
var DV = BigInteger.prototype.DV = 1 << dbits;

var BI_FP = 52;
BigInteger.prototype.FV = Math.pow(2, BI_FP);
BigInteger.prototype.F1 = BI_FP - dbits;
BigInteger.prototype.F2 = 2 * dbits - BI_FP;

// Digit conversions
var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
var BI_RC = new Array();
var rr, vv;
rr = "0".charCodeAt(0);
for (vv = 0; vv <= 9; ++vv) {
  BI_RC[rr++] = vv;
}rr = "a".charCodeAt(0);
for (vv = 10; vv < 36; ++vv) {
  BI_RC[rr++] = vv;
}rr = "A".charCodeAt(0);
for (vv = 10; vv < 36; ++vv) {
  BI_RC[rr++] = vv;
}function int2char(n) {
  return BI_RM.charAt(n);
}

function intAt(s, i) {
  var c = BI_RC[s.charCodeAt(i)];
  return c == null ? -1 : c;
}

// (protected) copy this to r
function bnpCopyTo(r) {
  for (var i = this.t - 1; i >= 0; --i) {
    r[i] = this[i];
  }r.t = this.t;
  r.s = this.s;
}

// (protected) set from integer value x, -DV <= x < DV
function bnpFromInt(x) {
  this.t = 1;
  this.s = x < 0 ? -1 : 0;
  if (x > 0) this[0] = x;else if (x < -1) this[0] = x + DV;else this.t = 0;
}

// return bigint initialized to value
function nbv(i) {
  var r = new BigInteger();
  r.fromInt(i);
  return r;
}

// (protected) set from string and radix
function bnpFromString(s, b) {
  var self = this;

  var k;
  if (b == 16) k = 4;else if (b == 8) k = 3;else if (b == 256) k = 8; // byte array
  else if (b == 2) k = 1;else if (b == 32) k = 5;else if (b == 4) k = 2;else {
      self.fromRadix(s, b);
      return;
    }
  self.t = 0;
  self.s = 0;
  var i = s.length,
      mi = false,
      sh = 0;
  while (--i >= 0) {
    var x = k == 8 ? s[i] & 0xff : intAt(s, i);
    if (x < 0) {
      if (s.charAt(i) == "-") mi = true;
      continue;
    }
    mi = false;
    if (sh == 0) self[self.t++] = x;else if (sh + k > self.DB) {
      self[self.t - 1] |= (x & (1 << self.DB - sh) - 1) << sh;
      self[self.t++] = x >> self.DB - sh;
    } else self[self.t - 1] |= x << sh;
    sh += k;
    if (sh >= self.DB) sh -= self.DB;
  }
  if (k == 8 && (s[0] & 0x80) != 0) {
    self.s = -1;
    if (sh > 0) self[self.t - 1] |= (1 << self.DB - sh) - 1 << sh;
  }
  self.clamp();
  if (mi) BigInteger.ZERO.subTo(self, self);
}

// (protected) clamp off excess high words
function bnpClamp() {
  var c = this.s & this.DM;
  while (this.t > 0 && this[this.t - 1] == c) {
    --this.t;
  }
}

// (public) return string representation in given radix
function bnToString(b) {
  var self = this;
  if (self.s < 0) return "-" + self.negate().toString(b);
  var k;
  if (b == 16) k = 4;else if (b == 8) k = 3;else if (b == 2) k = 1;else if (b == 32) k = 5;else if (b == 4) k = 2;else return self.toRadix(b);
  var km = (1 << k) - 1,
      d,
      m = false,
      r = "",
      i = self.t;
  var p = self.DB - i * self.DB % k;
  if (i-- > 0) {
    if (p < self.DB && (d = self[i] >> p) > 0) {
      m = true;
      r = int2char(d);
    }
    while (i >= 0) {
      if (p < k) {
        d = (self[i] & (1 << p) - 1) << k - p;
        d |= self[--i] >> (p += self.DB - k);
      } else {
        d = self[i] >> (p -= k) & km;
        if (p <= 0) {
          p += self.DB;
          --i;
        }
      }
      if (d > 0) m = true;
      if (m) r += int2char(d);
    }
  }
  return m ? r : "0";
}

// (public) -this
function bnNegate() {
  var r = new BigInteger();
  BigInteger.ZERO.subTo(this, r);
  return r;
}

// (public) |this|
function bnAbs() {
  return this.s < 0 ? this.negate() : this;
}

// (public) return + if this > a, - if this < a, 0 if equal
function bnCompareTo(a) {
  var r = this.s - a.s;
  if (r != 0) return r;
  var i = this.t;
  r = i - a.t;
  if (r != 0) return this.s < 0 ? -r : r;
  while (--i >= 0) {
    if ((r = this[i] - a[i]) != 0) return r;
  }return 0;
}

// returns bit length of the integer x
function nbits(x) {
  var r = 1,
      t;
  if ((t = x >>> 16) != 0) {
    x = t;
    r += 16;
  }
  if ((t = x >> 8) != 0) {
    x = t;
    r += 8;
  }
  if ((t = x >> 4) != 0) {
    x = t;
    r += 4;
  }
  if ((t = x >> 2) != 0) {
    x = t;
    r += 2;
  }
  if ((t = x >> 1) != 0) {
    x = t;
    r += 1;
  }
  return r;
}

// (public) return the number of bits in "this"
function bnBitLength() {
  if (this.t <= 0) return 0;
  return this.DB * (this.t - 1) + nbits(this[this.t - 1] ^ this.s & this.DM);
}

// (public) return the number of bytes in "this"
function bnByteLength() {
  return this.bitLength() >> 3;
}

// (protected) r = this << n*DB
function bnpDLShiftTo(n, r) {
  var i;
  for (i = this.t - 1; i >= 0; --i) {
    r[i + n] = this[i];
  }for (i = n - 1; i >= 0; --i) {
    r[i] = 0;
  }r.t = this.t + n;
  r.s = this.s;
}

// (protected) r = this >> n*DB
function bnpDRShiftTo(n, r) {
  for (var i = n; i < this.t; ++i) {
    r[i - n] = this[i];
  }r.t = Math.max(this.t - n, 0);
  r.s = this.s;
}

// (protected) r = this << n
function bnpLShiftTo(n, r) {
  var self = this;
  var bs = n % self.DB;
  var cbs = self.DB - bs;
  var bm = (1 << cbs) - 1;
  var ds = Math.floor(n / self.DB),
      c = self.s << bs & self.DM,
      i;
  for (i = self.t - 1; i >= 0; --i) {
    r[i + ds + 1] = self[i] >> cbs | c;
    c = (self[i] & bm) << bs;
  }
  for (i = ds - 1; i >= 0; --i) {
    r[i] = 0;
  }r[ds] = c;
  r.t = self.t + ds + 1;
  r.s = self.s;
  r.clamp();
}

// (protected) r = this >> n
function bnpRShiftTo(n, r) {
  var self = this;
  r.s = self.s;
  var ds = Math.floor(n / self.DB);
  if (ds >= self.t) {
    r.t = 0;
    return;
  }
  var bs = n % self.DB;
  var cbs = self.DB - bs;
  var bm = (1 << bs) - 1;
  r[0] = self[ds] >> bs;
  for (var i = ds + 1; i < self.t; ++i) {
    r[i - ds - 1] |= (self[i] & bm) << cbs;
    r[i - ds] = self[i] >> bs;
  }
  if (bs > 0) r[self.t - ds - 1] |= (self.s & bm) << cbs;
  r.t = self.t - ds;
  r.clamp();
}

// (protected) r = this - a
function bnpSubTo(a, r) {
  var self = this;
  var i = 0,
      c = 0,
      m = Math.min(a.t, self.t);
  while (i < m) {
    c += self[i] - a[i];
    r[i++] = c & self.DM;
    c >>= self.DB;
  }
  if (a.t < self.t) {
    c -= a.s;
    while (i < self.t) {
      c += self[i];
      r[i++] = c & self.DM;
      c >>= self.DB;
    }
    c += self.s;
  } else {
    c += self.s;
    while (i < a.t) {
      c -= a[i];
      r[i++] = c & self.DM;
      c >>= self.DB;
    }
    c -= a.s;
  }
  r.s = c < 0 ? -1 : 0;
  if (c < -1) r[i++] = self.DV + c;else if (c > 0) r[i++] = c;
  r.t = i;
  r.clamp();
}

// (protected) r = this * a, r != this,a (HAC 14.12)
// "this" should be the larger one if appropriate.
function bnpMultiplyTo(a, r) {
  var x = this.abs(),
      y = a.abs();
  var i = x.t;
  r.t = i + y.t;
  while (--i >= 0) {
    r[i] = 0;
  }for (i = 0; i < y.t; ++i) {
    r[i + x.t] = x.am(0, y[i], r, i, 0, x.t);
  }r.s = 0;
  r.clamp();
  if (this.s != a.s) BigInteger.ZERO.subTo(r, r);
}

// (protected) r = this^2, r != this (HAC 14.16)
function bnpSquareTo(r) {
  var x = this.abs();
  var i = r.t = 2 * x.t;
  while (--i >= 0) {
    r[i] = 0;
  }for (i = 0; i < x.t - 1; ++i) {
    var c = x.am(i, x[i], r, 2 * i, 0, 1);
    if ((r[i + x.t] += x.am(i + 1, 2 * x[i], r, 2 * i + 1, c, x.t - i - 1)) >= x.DV) {
      r[i + x.t] -= x.DV;
      r[i + x.t + 1] = 1;
    }
  }
  if (r.t > 0) r[r.t - 1] += x.am(i, x[i], r, 2 * i, 0, 1);
  r.s = 0;
  r.clamp();
}

// (protected) divide this by m, quotient and remainder to q, r (HAC 14.20)
// r != q, this != m.  q or r may be null.
function bnpDivRemTo(m, q, r) {
  var self = this;
  var pm = m.abs();
  if (pm.t <= 0) return;
  var pt = self.abs();
  if (pt.t < pm.t) {
    if (q != null) q.fromInt(0);
    if (r != null) self.copyTo(r);
    return;
  }
  if (r == null) r = new BigInteger();
  var y = new BigInteger(),
      ts = self.s,
      ms = m.s;
  var nsh = self.DB - nbits(pm[pm.t - 1]); // normalize modulus
  if (nsh > 0) {
    pm.lShiftTo(nsh, y);
    pt.lShiftTo(nsh, r);
  } else {
    pm.copyTo(y);
    pt.copyTo(r);
  }
  var ys = y.t;
  var y0 = y[ys - 1];
  if (y0 == 0) return;
  var yt = y0 * (1 << self.F1) + (ys > 1 ? y[ys - 2] >> self.F2 : 0);
  var d1 = self.FV / yt,
      d2 = (1 << self.F1) / yt,
      e = 1 << self.F2;
  var i = r.t,
      j = i - ys,
      t = q == null ? new BigInteger() : q;
  y.dlShiftTo(j, t);
  if (r.compareTo(t) >= 0) {
    r[r.t++] = 1;
    r.subTo(t, r);
  }
  BigInteger.ONE.dlShiftTo(ys, t);
  t.subTo(y, y); // "negative" y so we can replace sub with am later
  while (y.t < ys) {
    y[y.t++] = 0;
  }while (--j >= 0) {
    // Estimate quotient digit
    var qd = r[--i] == y0 ? self.DM : Math.floor(r[i] * d1 + (r[i - 1] + e) * d2);
    if ((r[i] += y.am(0, qd, r, j, 0, ys)) < qd) {
      // Try it out
      y.dlShiftTo(j, t);
      r.subTo(t, r);
      while (r[i] < --qd) {
        r.subTo(t, r);
      }
    }
  }
  if (q != null) {
    r.drShiftTo(ys, q);
    if (ts != ms) BigInteger.ZERO.subTo(q, q);
  }
  r.t = ys;
  r.clamp();
  if (nsh > 0) r.rShiftTo(nsh, r); // Denormalize remainder
  if (ts < 0) BigInteger.ZERO.subTo(r, r);
}

// (public) this mod a
function bnMod(a) {
  var r = new BigInteger();
  this.abs().divRemTo(a, null, r);
  if (this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r, r);
  return r;
}

// Modular reduction using "classic" algorithm
function Classic(m) {
  this.m = m;
}

function cConvert(x) {
  if (x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);else return x;
}

function cRevert(x) {
  return x;
}

function cReduce(x) {
  x.divRemTo(this.m, null, x);
}

function cMulTo(x, y, r) {
  x.multiplyTo(y, r);
  this.reduce(r);
}

function cSqrTo(x, r) {
  x.squareTo(r);
  this.reduce(r);
}

Classic.prototype.convert = cConvert;
Classic.prototype.revert = cRevert;
Classic.prototype.reduce = cReduce;
Classic.prototype.mulTo = cMulTo;
Classic.prototype.sqrTo = cSqrTo;

// (protected) return "-1/this % 2^DB"; useful for Mont. reduction
// justification:
//         xy == 1 (mod m)
//         xy =  1+km
//   xy(2-xy) = (1+km)(1-km)
// x[y(2-xy)] = 1-k^2m^2
// x[y(2-xy)] == 1 (mod m^2)
// if y is 1/x mod m, then y(2-xy) is 1/x mod m^2
// should reduce x and y(2-xy) by m^2 at each step to keep size bounded.
// JS multiply "overflows" differently from C/C++, so care is needed here.
function bnpInvDigit() {
  if (this.t < 1) return 0;
  var x = this[0];
  if ((x & 1) == 0) return 0;
  var y = x & 3; // y == 1/x mod 2^2
  y = y * (2 - (x & 0xf) * y) & 0xf; // y == 1/x mod 2^4
  y = y * (2 - (x & 0xff) * y) & 0xff; // y == 1/x mod 2^8
  y = y * (2 - ((x & 0xffff) * y & 0xffff)) & 0xffff; // y == 1/x mod 2^16
  // last step - calculate inverse mod DV directly
  // assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
  y = y * (2 - x * y % this.DV) % this.DV; // y == 1/x mod 2^dbits
  // we really want the negative inverse, and -DV < y < DV
  return y > 0 ? this.DV - y : -y;
}

// Montgomery reduction
function Montgomery(m) {
  this.m = m;
  this.mp = m.invDigit();
  this.mpl = this.mp & 0x7fff;
  this.mph = this.mp >> 15;
  this.um = (1 << m.DB - 15) - 1;
  this.mt2 = 2 * m.t;
}

// xR mod m
function montConvert(x) {
  var r = new BigInteger();
  x.abs().dlShiftTo(this.m.t, r);
  r.divRemTo(this.m, null, r);
  if (x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r, r);
  return r;
}

// x/R mod m
function montRevert(x) {
  var r = new BigInteger();
  x.copyTo(r);
  this.reduce(r);
  return r;
}

// x = x/R mod m (HAC 14.32)
function montReduce(x) {
  while (x.t <= this.mt2) {
    // pad x so am has enough room later
    x[x.t++] = 0;
  }for (var i = 0; i < this.m.t; ++i) {
    // faster way of calculating u0 = x[i]*mp mod DV
    var j = x[i] & 0x7fff;
    var u0 = j * this.mpl + ((j * this.mph + (x[i] >> 15) * this.mpl & this.um) << 15) & x.DM;
    // use am to combine the multiply-shift-add into one call
    j = i + this.m.t;
    x[j] += this.m.am(0, u0, x, i, 0, this.m.t);
    // propagate carry
    while (x[j] >= x.DV) {
      x[j] -= x.DV;
      x[++j]++;
    }
  }
  x.clamp();
  x.drShiftTo(this.m.t, x);
  if (x.compareTo(this.m) >= 0) x.subTo(this.m, x);
}

// r = "x^2/R mod m"; x != r
function montSqrTo(x, r) {
  x.squareTo(r);
  this.reduce(r);
}

// r = "xy/R mod m"; x,y != r
function montMulTo(x, y, r) {
  x.multiplyTo(y, r);
  this.reduce(r);
}

Montgomery.prototype.convert = montConvert;
Montgomery.prototype.revert = montRevert;
Montgomery.prototype.reduce = montReduce;
Montgomery.prototype.mulTo = montMulTo;
Montgomery.prototype.sqrTo = montSqrTo;

// (protected) true iff this is even
function bnpIsEven() {
  return (this.t > 0 ? this[0] & 1 : this.s) == 0;
}

// (protected) this^e, e < 2^32, doing sqr and mul with "r" (HAC 14.79)
function bnpExp(e, z) {
  if (e > 0xffffffff || e < 1) return BigInteger.ONE;
  var r = new BigInteger(),
      r2 = new BigInteger(),
      g = z.convert(this),
      i = nbits(e) - 1;
  g.copyTo(r);
  while (--i >= 0) {
    z.sqrTo(r, r2);
    if ((e & 1 << i) > 0) z.mulTo(r2, g, r);else {
      var t = r;
      r = r2;
      r2 = t;
    }
  }
  return z.revert(r);
}

// (public) this^e % m, 0 <= e < 2^32
function bnModPowInt(e, m) {
  var z;
  if (e < 256 || m.isEven()) z = new Classic(m);else z = new Montgomery(m);
  return this.exp(e, z);
}

// protected
proto.copyTo = bnpCopyTo;
proto.fromInt = bnpFromInt;
proto.fromString = bnpFromString;
proto.clamp = bnpClamp;
proto.dlShiftTo = bnpDLShiftTo;
proto.drShiftTo = bnpDRShiftTo;
proto.lShiftTo = bnpLShiftTo;
proto.rShiftTo = bnpRShiftTo;
proto.subTo = bnpSubTo;
proto.multiplyTo = bnpMultiplyTo;
proto.squareTo = bnpSquareTo;
proto.divRemTo = bnpDivRemTo;
proto.invDigit = bnpInvDigit;
proto.isEven = bnpIsEven;
proto.exp = bnpExp;

// public
proto.toString = bnToString;
proto.negate = bnNegate;
proto.abs = bnAbs;
proto.compareTo = bnCompareTo;
proto.bitLength = bnBitLength;
proto.byteLength = bnByteLength;
proto.mod = bnMod;
proto.modPowInt = bnModPowInt;

// (public)
function bnClone() {
  var r = new BigInteger();
  this.copyTo(r);
  return r;
}

// (public) return value as integer
function bnIntValue() {
  if (this.s < 0) {
    if (this.t == 1) return this[0] - this.DV;else if (this.t == 0) return -1;
  } else if (this.t == 1) return this[0];else if (this.t == 0) return 0;
  // assumes 16 < DB < 32
  return (this[1] & (1 << 32 - this.DB) - 1) << this.DB | this[0];
}

// (public) return value as byte
function bnByteValue() {
  return this.t == 0 ? this.s : this[0] << 24 >> 24;
}

// (public) return value as short (assumes DB>=16)
function bnShortValue() {
  return this.t == 0 ? this.s : this[0] << 16 >> 16;
}

// (protected) return x s.t. r^x < DV
function bnpChunkSize(r) {
  return Math.floor(Math.LN2 * this.DB / Math.log(r));
}

// (public) 0 if this == 0, 1 if this > 0
function bnSigNum() {
  if (this.s < 0) return -1;else if (this.t <= 0 || this.t == 1 && this[0] <= 0) return 0;else return 1;
}

// (protected) convert to radix string
function bnpToRadix(b) {
  if (b == null) b = 10;
  if (this.signum() == 0 || b < 2 || b > 36) return "0";
  var cs = this.chunkSize(b);
  var a = Math.pow(b, cs);
  var d = nbv(a),
      y = new BigInteger(),
      z = new BigInteger(),
      r = "";
  this.divRemTo(d, y, z);
  while (y.signum() > 0) {
    r = (a + z.intValue()).toString(b).substr(1) + r;
    y.divRemTo(d, y, z);
  }
  return z.intValue().toString(b) + r;
}

// (protected) convert from radix string
function bnpFromRadix(s, b) {
  var self = this;
  self.fromInt(0);
  if (b == null) b = 10;
  var cs = self.chunkSize(b);
  var d = Math.pow(b, cs),
      mi = false,
      j = 0,
      w = 0;
  for (var i = 0; i < s.length; ++i) {
    var x = intAt(s, i);
    if (x < 0) {
      if (s.charAt(i) == "-" && self.signum() == 0) mi = true;
      continue;
    }
    w = b * w + x;
    if (++j >= cs) {
      self.dMultiply(d);
      self.dAddOffset(w, 0);
      j = 0;
      w = 0;
    }
  }
  if (j > 0) {
    self.dMultiply(Math.pow(b, j));
    self.dAddOffset(w, 0);
  }
  if (mi) BigInteger.ZERO.subTo(self, self);
}

// (protected) alternate constructor
function bnpFromNumber(a, b, c) {
  var self = this;
  if ("number" == typeof b) {
    // new BigInteger(int,int,RNG)
    if (a < 2) self.fromInt(1);else {
      self.fromNumber(a, c);
      if (!self.testBit(a - 1)) // force MSB set
        self.bitwiseTo(BigInteger.ONE.shiftLeft(a - 1), op_or, self);
      if (self.isEven()) self.dAddOffset(1, 0); // force odd
      while (!self.isProbablePrime(b)) {
        self.dAddOffset(2, 0);
        if (self.bitLength() > a) self.subTo(BigInteger.ONE.shiftLeft(a - 1), self);
      }
    }
  } else {
    // new BigInteger(int,RNG)
    var x = new Array(),
        t = a & 7;
    x.length = (a >> 3) + 1;
    b.nextBytes(x);
    if (t > 0) x[0] &= (1 << t) - 1;else x[0] = 0;
    self.fromString(x, 256);
  }
}

// (public) convert to bigendian byte array
function bnToByteArray() {
  var self = this;
  var i = self.t,
      r = new Array();
  r[0] = self.s;
  var p = self.DB - i * self.DB % 8,
      d,
      k = 0;
  if (i-- > 0) {
    if (p < self.DB && (d = self[i] >> p) != (self.s & self.DM) >> p) r[k++] = d | self.s << self.DB - p;
    while (i >= 0) {
      if (p < 8) {
        d = (self[i] & (1 << p) - 1) << 8 - p;
        d |= self[--i] >> (p += self.DB - 8);
      } else {
        d = self[i] >> (p -= 8) & 0xff;
        if (p <= 0) {
          p += self.DB;
          --i;
        }
      }
      if ((d & 0x80) != 0) d |= -256;
      if (k === 0 && (self.s & 0x80) != (d & 0x80)) ++k;
      if (k > 0 || d != self.s) r[k++] = d;
    }
  }
  return r;
}

function bnEquals(a) {
  return this.compareTo(a) == 0;
}

function bnMin(a) {
  return this.compareTo(a) < 0 ? this : a;
}

function bnMax(a) {
  return this.compareTo(a) > 0 ? this : a;
}

// (protected) r = this op a (bitwise)
function bnpBitwiseTo(a, op, r) {
  var self = this;
  var i,
      f,
      m = Math.min(a.t, self.t);
  for (i = 0; i < m; ++i) {
    r[i] = op(self[i], a[i]);
  }if (a.t < self.t) {
    f = a.s & self.DM;
    for (i = m; i < self.t; ++i) {
      r[i] = op(self[i], f);
    }r.t = self.t;
  } else {
    f = self.s & self.DM;
    for (i = m; i < a.t; ++i) {
      r[i] = op(f, a[i]);
    }r.t = a.t;
  }
  r.s = op(self.s, a.s);
  r.clamp();
}

// (public) this & a
function op_and(x, y) {
  return x & y;
}

function bnAnd(a) {
  var r = new BigInteger();
  this.bitwiseTo(a, op_and, r);
  return r;
}

// (public) this | a
function op_or(x, y) {
  return x | y;
}

function bnOr(a) {
  var r = new BigInteger();
  this.bitwiseTo(a, op_or, r);
  return r;
}

// (public) this ^ a
function op_xor(x, y) {
  return x ^ y;
}

function bnXor(a) {
  var r = new BigInteger();
  this.bitwiseTo(a, op_xor, r);
  return r;
}

// (public) this & ~a
function op_andnot(x, y) {
  return x & ~y;
}

function bnAndNot(a) {
  var r = new BigInteger();
  this.bitwiseTo(a, op_andnot, r);
  return r;
}

// (public) ~this
function bnNot() {
  var r = new BigInteger();
  for (var i = 0; i < this.t; ++i) {
    r[i] = this.DM & ~this[i];
  }r.t = this.t;
  r.s = ~this.s;
  return r;
}

// (public) this << n
function bnShiftLeft(n) {
  var r = new BigInteger();
  if (n < 0) this.rShiftTo(-n, r);else this.lShiftTo(n, r);
  return r;
}

// (public) this >> n
function bnShiftRight(n) {
  var r = new BigInteger();
  if (n < 0) this.lShiftTo(-n, r);else this.rShiftTo(n, r);
  return r;
}

// return index of lowest 1-bit in x, x < 2^31
function lbit(x) {
  if (x == 0) return -1;
  var r = 0;
  if ((x & 0xffff) == 0) {
    x >>= 16;
    r += 16;
  }
  if ((x & 0xff) == 0) {
    x >>= 8;
    r += 8;
  }
  if ((x & 0xf) == 0) {
    x >>= 4;
    r += 4;
  }
  if ((x & 3) == 0) {
    x >>= 2;
    r += 2;
  }
  if ((x & 1) == 0) ++r;
  return r;
}

// (public) returns index of lowest 1-bit (or -1 if none)
function bnGetLowestSetBit() {
  for (var i = 0; i < this.t; ++i) {
    if (this[i] != 0) return i * this.DB + lbit(this[i]);
  }if (this.s < 0) return this.t * this.DB;
  return -1;
}

// return number of 1 bits in x
function cbit(x) {
  var r = 0;
  while (x != 0) {
    x &= x - 1;
    ++r;
  }
  return r;
}

// (public) return number of set bits
function bnBitCount() {
  var r = 0,
      x = this.s & this.DM;
  for (var i = 0; i < this.t; ++i) {
    r += cbit(this[i] ^ x);
  }return r;
}

// (public) true iff nth bit is set
function bnTestBit(n) {
  var j = Math.floor(n / this.DB);
  if (j >= this.t) return this.s != 0;
  return (this[j] & 1 << n % this.DB) != 0;
}

// (protected) this op (1<<n)
function bnpChangeBit(n, op) {
  var r = BigInteger.ONE.shiftLeft(n);
  this.bitwiseTo(r, op, r);
  return r;
}

// (public) this | (1<<n)
function bnSetBit(n) {
  return this.changeBit(n, op_or);
}

// (public) this & ~(1<<n)
function bnClearBit(n) {
  return this.changeBit(n, op_andnot);
}

// (public) this ^ (1<<n)
function bnFlipBit(n) {
  return this.changeBit(n, op_xor);
}

// (protected) r = this + a
function bnpAddTo(a, r) {
  var self = this;

  var i = 0,
      c = 0,
      m = Math.min(a.t, self.t);
  while (i < m) {
    c += self[i] + a[i];
    r[i++] = c & self.DM;
    c >>= self.DB;
  }
  if (a.t < self.t) {
    c += a.s;
    while (i < self.t) {
      c += self[i];
      r[i++] = c & self.DM;
      c >>= self.DB;
    }
    c += self.s;
  } else {
    c += self.s;
    while (i < a.t) {
      c += a[i];
      r[i++] = c & self.DM;
      c >>= self.DB;
    }
    c += a.s;
  }
  r.s = c < 0 ? -1 : 0;
  if (c > 0) r[i++] = c;else if (c < -1) r[i++] = self.DV + c;
  r.t = i;
  r.clamp();
}

// (public) this + a
function bnAdd(a) {
  var r = new BigInteger();
  this.addTo(a, r);
  return r;
}

// (public) this - a
function bnSubtract(a) {
  var r = new BigInteger();
  this.subTo(a, r);
  return r;
}

// (public) this * a
function bnMultiply(a) {
  var r = new BigInteger();
  this.multiplyTo(a, r);
  return r;
}

// (public) this^2
function bnSquare() {
  var r = new BigInteger();
  this.squareTo(r);
  return r;
}

// (public) this / a
function bnDivide(a) {
  var r = new BigInteger();
  this.divRemTo(a, r, null);
  return r;
}

// (public) this % a
function bnRemainder(a) {
  var r = new BigInteger();
  this.divRemTo(a, null, r);
  return r;
}

// (public) [this/a,this%a]
function bnDivideAndRemainder(a) {
  var q = new BigInteger(),
      r = new BigInteger();
  this.divRemTo(a, q, r);
  return new Array(q, r);
}

// (protected) this *= n, this >= 0, 1 < n < DV
function bnpDMultiply(n) {
  this[this.t] = this.am(0, n - 1, this, 0, 0, this.t);
  ++this.t;
  this.clamp();
}

// (protected) this += n << w words, this >= 0
function bnpDAddOffset(n, w) {
  if (n == 0) return;
  while (this.t <= w) {
    this[this.t++] = 0;
  }this[w] += n;
  while (this[w] >= this.DV) {
    this[w] -= this.DV;
    if (++w >= this.t) this[this.t++] = 0;
    ++this[w];
  }
}

// A "null" reducer
function NullExp() {}

function nNop(x) {
  return x;
}

function nMulTo(x, y, r) {
  x.multiplyTo(y, r);
}

function nSqrTo(x, r) {
  x.squareTo(r);
}

NullExp.prototype.convert = nNop;
NullExp.prototype.revert = nNop;
NullExp.prototype.mulTo = nMulTo;
NullExp.prototype.sqrTo = nSqrTo;

// (public) this^e
function bnPow(e) {
  return this.exp(e, new NullExp());
}

// (protected) r = lower n words of "this * a", a.t <= n
// "this" should be the larger one if appropriate.
function bnpMultiplyLowerTo(a, n, r) {
  var i = Math.min(this.t + a.t, n);
  r.s = 0; // assumes a,this >= 0
  r.t = i;
  while (i > 0) {
    r[--i] = 0;
  }var j;
  for (j = r.t - this.t; i < j; ++i) {
    r[i + this.t] = this.am(0, a[i], r, i, 0, this.t);
  }for (j = Math.min(a.t, n); i < j; ++i) {
    this.am(0, a[i], r, i, 0, n - i);
  }r.clamp();
}

// (protected) r = "this * a" without lower n words, n > 0
// "this" should be the larger one if appropriate.
function bnpMultiplyUpperTo(a, n, r) {
  --n;
  var i = r.t = this.t + a.t - n;
  r.s = 0; // assumes a,this >= 0
  while (--i >= 0) {
    r[i] = 0;
  }for (i = Math.max(n - this.t, 0); i < a.t; ++i) {
    r[this.t + i - n] = this.am(n - i, a[i], r, 0, 0, this.t + i - n);
  }r.clamp();
  r.drShiftTo(1, r);
}

// Barrett modular reduction
function Barrett(m) {
  // setup Barrett
  this.r2 = new BigInteger();
  this.q3 = new BigInteger();
  BigInteger.ONE.dlShiftTo(2 * m.t, this.r2);
  this.mu = this.r2.divide(m);
  this.m = m;
}

function barrettConvert(x) {
  if (x.s < 0 || x.t > 2 * this.m.t) return x.mod(this.m);else if (x.compareTo(this.m) < 0) return x;else {
    var r = new BigInteger();
    x.copyTo(r);
    this.reduce(r);
    return r;
  }
}

function barrettRevert(x) {
  return x;
}

// x = x mod m (HAC 14.42)
function barrettReduce(x) {
  var self = this;
  x.drShiftTo(self.m.t - 1, self.r2);
  if (x.t > self.m.t + 1) {
    x.t = self.m.t + 1;
    x.clamp();
  }
  self.mu.multiplyUpperTo(self.r2, self.m.t + 1, self.q3);
  self.m.multiplyLowerTo(self.q3, self.m.t + 1, self.r2);
  while (x.compareTo(self.r2) < 0) {
    x.dAddOffset(1, self.m.t + 1);
  }x.subTo(self.r2, x);
  while (x.compareTo(self.m) >= 0) {
    x.subTo(self.m, x);
  }
}

// r = x^2 mod m; x != r
function barrettSqrTo(x, r) {
  x.squareTo(r);
  this.reduce(r);
}

// r = x*y mod m; x,y != r
function barrettMulTo(x, y, r) {
  x.multiplyTo(y, r);
  this.reduce(r);
}

Barrett.prototype.convert = barrettConvert;
Barrett.prototype.revert = barrettRevert;
Barrett.prototype.reduce = barrettReduce;
Barrett.prototype.mulTo = barrettMulTo;
Barrett.prototype.sqrTo = barrettSqrTo;

// (public) this^e % m (HAC 14.85)
function bnModPow(e, m) {
  var i = e.bitLength(),
      k,
      r = nbv(1),
      z;
  if (i <= 0) return r;else if (i < 18) k = 1;else if (i < 48) k = 3;else if (i < 144) k = 4;else if (i < 768) k = 5;else k = 6;
  if (i < 8) z = new Classic(m);else if (m.isEven()) z = new Barrett(m);else z = new Montgomery(m);

  // precomputation
  var g = new Array(),
      n = 3,
      k1 = k - 1,
      km = (1 << k) - 1;
  g[1] = z.convert(this);
  if (k > 1) {
    var g2 = new BigInteger();
    z.sqrTo(g[1], g2);
    while (n <= km) {
      g[n] = new BigInteger();
      z.mulTo(g2, g[n - 2], g[n]);
      n += 2;
    }
  }

  var j = e.t - 1,
      w,
      is1 = true,
      r2 = new BigInteger(),
      t;
  i = nbits(e[j]) - 1;
  while (j >= 0) {
    if (i >= k1) w = e[j] >> i - k1 & km;else {
      w = (e[j] & (1 << i + 1) - 1) << k1 - i;
      if (j > 0) w |= e[j - 1] >> this.DB + i - k1;
    }

    n = k;
    while ((w & 1) == 0) {
      w >>= 1;
      --n;
    }
    if ((i -= n) < 0) {
      i += this.DB;
      --j;
    }
    if (is1) {
      // ret == 1, don't bother squaring or multiplying it
      g[w].copyTo(r);
      is1 = false;
    } else {
      while (n > 1) {
        z.sqrTo(r, r2);
        z.sqrTo(r2, r);
        n -= 2;
      }
      if (n > 0) z.sqrTo(r, r2);else {
        t = r;
        r = r2;
        r2 = t;
      }
      z.mulTo(r2, g[w], r);
    }

    while (j >= 0 && (e[j] & 1 << i) == 0) {
      z.sqrTo(r, r2);
      t = r;
      r = r2;
      r2 = t;
      if (--i < 0) {
        i = this.DB - 1;
        --j;
      }
    }
  }
  return z.revert(r);
}

// (public) gcd(this,a) (HAC 14.54)
function bnGCD(a) {
  var x = this.s < 0 ? this.negate() : this.clone();
  var y = a.s < 0 ? a.negate() : a.clone();
  if (x.compareTo(y) < 0) {
    var t = x;
    x = y;
    y = t;
  }
  var i = x.getLowestSetBit(),
      g = y.getLowestSetBit();
  if (g < 0) return x;
  if (i < g) g = i;
  if (g > 0) {
    x.rShiftTo(g, x);
    y.rShiftTo(g, y);
  }
  while (x.signum() > 0) {
    if ((i = x.getLowestSetBit()) > 0) x.rShiftTo(i, x);
    if ((i = y.getLowestSetBit()) > 0) y.rShiftTo(i, y);
    if (x.compareTo(y) >= 0) {
      x.subTo(y, x);
      x.rShiftTo(1, x);
    } else {
      y.subTo(x, y);
      y.rShiftTo(1, y);
    }
  }
  if (g > 0) y.lShiftTo(g, y);
  return y;
}

// (protected) this % n, n < 2^26
function bnpModInt(n) {
  if (n <= 0) return 0;
  var d = this.DV % n,
      r = this.s < 0 ? n - 1 : 0;
  if (this.t > 0) if (d == 0) r = this[0] % n;else for (var i = this.t - 1; i >= 0; --i) {
    r = (d * r + this[i]) % n;
  }return r;
}

// (public) 1/this % m (HAC 14.61)
function bnModInverse(m) {
  var ac = m.isEven();
  if (this.signum() === 0) throw new Error('division by zero');
  if (this.isEven() && ac || m.signum() == 0) return BigInteger.ZERO;
  var u = m.clone(),
      v = this.clone();
  var a = nbv(1),
      b = nbv(0),
      c = nbv(0),
      d = nbv(1);
  while (u.signum() != 0) {
    while (u.isEven()) {
      u.rShiftTo(1, u);
      if (ac) {
        if (!a.isEven() || !b.isEven()) {
          a.addTo(this, a);
          b.subTo(m, b);
        }
        a.rShiftTo(1, a);
      } else if (!b.isEven()) b.subTo(m, b);
      b.rShiftTo(1, b);
    }
    while (v.isEven()) {
      v.rShiftTo(1, v);
      if (ac) {
        if (!c.isEven() || !d.isEven()) {
          c.addTo(this, c);
          d.subTo(m, d);
        }
        c.rShiftTo(1, c);
      } else if (!d.isEven()) d.subTo(m, d);
      d.rShiftTo(1, d);
    }
    if (u.compareTo(v) >= 0) {
      u.subTo(v, u);
      if (ac) a.subTo(c, a);
      b.subTo(d, b);
    } else {
      v.subTo(u, v);
      if (ac) c.subTo(a, c);
      d.subTo(b, d);
    }
  }
  if (v.compareTo(BigInteger.ONE) != 0) return BigInteger.ZERO;
  while (d.compareTo(m) >= 0) {
    d.subTo(m, d);
  }while (d.signum() < 0) {
    d.addTo(m, d);
  }return d;
}

var lowprimes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659, 661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937, 941, 947, 953, 967, 971, 977, 983, 991, 997];

var lplim = (1 << 26) / lowprimes[lowprimes.length - 1];

// (public) test primality with certainty >= 1-.5^t
function bnIsProbablePrime(t) {
  var i,
      x = this.abs();
  if (x.t == 1 && x[0] <= lowprimes[lowprimes.length - 1]) {
    for (i = 0; i < lowprimes.length; ++i) {
      if (x[0] == lowprimes[i]) return true;
    }return false;
  }
  if (x.isEven()) return false;
  i = 1;
  while (i < lowprimes.length) {
    var m = lowprimes[i],
        j = i + 1;
    while (j < lowprimes.length && m < lplim) {
      m *= lowprimes[j++];
    }m = x.modInt(m);
    while (i < j) {
      if (m % lowprimes[i++] == 0) return false;
    }
  }
  return x.millerRabin(t);
}

// (protected) true if probably prime (HAC 4.24, Miller-Rabin)
function bnpMillerRabin(t) {
  var n1 = this.subtract(BigInteger.ONE);
  var k = n1.getLowestSetBit();
  if (k <= 0) return false;
  var r = n1.shiftRight(k);
  t = t + 1 >> 1;
  if (t > lowprimes.length) t = lowprimes.length;
  var a = new BigInteger(null);
  var j,
      bases = [];
  for (var i = 0; i < t; ++i) {
    for (;;) {
      j = lowprimes[Math.floor(Math.random() * lowprimes.length)];
      if (bases.indexOf(j) == -1) break;
    }
    bases.push(j);
    a.fromInt(j);
    var y = a.modPow(r, this);
    if (y.compareTo(BigInteger.ONE) != 0 && y.compareTo(n1) != 0) {
      var j = 1;
      while (j++ < k && y.compareTo(n1) != 0) {
        y = y.modPowInt(2, this);
        if (y.compareTo(BigInteger.ONE) == 0) return false;
      }
      if (y.compareTo(n1) != 0) return false;
    }
  }
  return true;
}

// protected
proto.chunkSize = bnpChunkSize;
proto.toRadix = bnpToRadix;
proto.fromRadix = bnpFromRadix;
proto.fromNumber = bnpFromNumber;
proto.bitwiseTo = bnpBitwiseTo;
proto.changeBit = bnpChangeBit;
proto.addTo = bnpAddTo;
proto.dMultiply = bnpDMultiply;
proto.dAddOffset = bnpDAddOffset;
proto.multiplyLowerTo = bnpMultiplyLowerTo;
proto.multiplyUpperTo = bnpMultiplyUpperTo;
proto.modInt = bnpModInt;
proto.millerRabin = bnpMillerRabin;

// public
proto.clone = bnClone;
proto.intValue = bnIntValue;
proto.byteValue = bnByteValue;
proto.shortValue = bnShortValue;
proto.signum = bnSigNum;
proto.toByteArray = bnToByteArray;
proto.equals = bnEquals;
proto.min = bnMin;
proto.max = bnMax;
proto.and = bnAnd;
proto.or = bnOr;
proto.xor = bnXor;
proto.andNot = bnAndNot;
proto.not = bnNot;
proto.shiftLeft = bnShiftLeft;
proto.shiftRight = bnShiftRight;
proto.getLowestSetBit = bnGetLowestSetBit;
proto.bitCount = bnBitCount;
proto.testBit = bnTestBit;
proto.setBit = bnSetBit;
proto.clearBit = bnClearBit;
proto.flipBit = bnFlipBit;
proto.add = bnAdd;
proto.subtract = bnSubtract;
proto.multiply = bnMultiply;
proto.divide = bnDivide;
proto.remainder = bnRemainder;
proto.divideAndRemainder = bnDivideAndRemainder;
proto.modPow = bnModPow;
proto.modInverse = bnModInverse;
proto.pow = bnPow;
proto.gcd = bnGCD;
proto.isProbablePrime = bnIsProbablePrime;

// JSBN-specific extension
proto.square = bnSquare;

// constants
BigInteger.ZERO = nbv(0);
BigInteger.ONE = nbv(1);
BigInteger.valueOf = nbv;

module.exports = BigInteger;

},{"../package.json":39}],37:[function(require,module,exports){
(function (Buffer){
'use strict';

// FIXME: Kind of a weird way to throw exceptions, consider removing
var assert = require('assert');
var BigInteger = require('./bigi');

/**
 * Turns a byte array into a big integer.
 *
 * This function will interpret a byte array as a big integer in big
 * endian notation.
 */
BigInteger.fromByteArrayUnsigned = function (byteArray) {
  // BigInteger expects a DER integer conformant byte array
  if (byteArray[0] & 0x80) {
    return new BigInteger([0].concat(byteArray));
  }

  return new BigInteger(byteArray);
};

/**
 * Returns a byte array representation of the big integer.
 *
 * This returns the absolute of the contained value in big endian
 * form. A value of zero results in an empty array.
 */
BigInteger.prototype.toByteArrayUnsigned = function () {
  var byteArray = this.toByteArray();
  return byteArray[0] === 0 ? byteArray.slice(1) : byteArray;
};

BigInteger.fromDERInteger = function (byteArray) {
  return new BigInteger(byteArray);
};

/*
 * Converts BigInteger to a DER integer representation.
 *
 * The format for this value uses the most significant bit as a sign
 * bit.  If the most significant bit is already set and the integer is
 * positive, a 0x00 is prepended.
 *
 * Examples:
 *
 *      0 =>     0x00
 *      1 =>     0x01
 *     -1 =>     0xff
 *    127 =>     0x7f
 *   -127 =>     0x81
 *    128 =>   0x0080
 *   -128 =>     0x80
 *    255 =>   0x00ff
 *   -255 =>   0xff01
 *  16300 =>   0x3fac
 * -16300 =>   0xc054
 *  62300 => 0x00f35c
 * -62300 => 0xff0ca4
*/
BigInteger.prototype.toDERInteger = BigInteger.prototype.toByteArray;

BigInteger.fromBuffer = function (buffer) {
  // BigInteger expects a DER integer conformant byte array
  if (buffer[0] & 0x80) {
    var byteArray = Array.prototype.slice.call(buffer);

    return new BigInteger([0].concat(byteArray));
  }

  return new BigInteger(buffer);
};

BigInteger.fromHex = function (hex) {
  if (hex === '') return BigInteger.ZERO;

  assert.equal(hex, hex.match(/^[A-Fa-f0-9]+/), 'Invalid hex string');
  assert.equal(hex.length % 2, 0, 'Incomplete hex');
  return new BigInteger(hex, 16);
};

BigInteger.prototype.toBuffer = function (size) {
  var byteArray = this.toByteArrayUnsigned();
  var zeros = [];

  var padding = size - byteArray.length;
  while (zeros.length < padding) {
    zeros.push(0);
  }return new Buffer(zeros.concat(byteArray));
};

BigInteger.prototype.toHex = function (size) {
  return this.toBuffer(size).toString('hex');
};

}).call(this,require("buffer").Buffer)
},{"./bigi":36,"assert":7,"buffer":121}],38:[function(require,module,exports){
'use strict';

var BigInteger = require('./bigi');

//addons
require('./convert');

module.exports = BigInteger;

},{"./bigi":36,"./convert":37}],39:[function(require,module,exports){
module.exports={
  "_from": "bigi@^1.4.0",
  "_id": "bigi@1.4.2",
  "_inBundle": false,
  "_integrity": "sha1-nGZalfiLiwj8Bc/XMfVhhZ1yWCU=",
  "_location": "/bigi",
  "_phantomChildren": {},
  "_requested": {
    "type": "range",
    "registry": true,
    "raw": "bigi@^1.4.0",
    "name": "bigi",
    "escapedName": "bigi",
    "rawSpec": "^1.4.0",
    "saveSpec": null,
    "fetchSpec": "^1.4.0"
  },
  "_requiredBy": [
    "/bitcoinjs-lib",
    "/ecurve"
  ],
  "_resolved": "https://registry.npmjs.org/bigi/-/bigi-1.4.2.tgz",
  "_shasum": "9c665a95f88b8b08fc05cfd731f561859d725825",
  "_spec": "bigi@^1.4.0",
  "_where": "/Users/will/code/hotwallet/ledger-sdk/node_modules/bitcoinjs-lib",
  "bugs": {
    "url": "https://github.com/cryptocoinjs/bigi/issues"
  },
  "bundleDependencies": false,
  "dependencies": {},
  "deprecated": false,
  "description": "Big integers.",
  "devDependencies": {
    "coveralls": "^2.11.2",
    "istanbul": "^0.3.5",
    "jshint": "^2.5.1",
    "mocha": "^2.1.0",
    "mochify": "^2.1.0"
  },
  "homepage": "https://github.com/cryptocoinjs/bigi#readme",
  "keywords": [
    "cryptography",
    "math",
    "bitcoin",
    "arbitrary",
    "precision",
    "arithmetic",
    "big",
    "integer",
    "int",
    "number",
    "biginteger",
    "bigint",
    "bignumber",
    "decimal",
    "float"
  ],
  "main": "./lib/index.js",
  "name": "bigi",
  "repository": {
    "url": "git+https://github.com/cryptocoinjs/bigi.git",
    "type": "git"
  },
  "scripts": {
    "browser-test": "mochify --wd -R spec",
    "coverage": "istanbul cover ./node_modules/.bin/_mocha -- --reporter list test/*.js",
    "coveralls": "npm run-script coverage && node ./node_modules/.bin/coveralls < coverage/lcov.info",
    "jshint": "jshint --config jshint.json lib/*.js ; true",
    "test": "_mocha -- test/*.js",
    "unit": "mocha"
  },
  "testling": {
    "files": "test/*.js",
    "harness": "mocha",
    "browsers": [
      "ie/9..latest",
      "firefox/latest",
      "chrome/latest",
      "safari/6.0..latest",
      "iphone/6.0..latest",
      "android-browser/4.2..latest"
    ]
  },
  "version": "1.4.2"
}

},{}],40:[function(require,module,exports){
'use strict';

// Reference https://github.com/bitcoin/bips/blob/master/bip-0066.mediawiki
// Format: 0x30 [total-length] 0x02 [R-length] [R] 0x02 [S-length] [S]
// NOTE: SIGHASH byte ignored AND restricted, truncate before use

var Buffer = require('safe-buffer').Buffer;

function check(buffer) {
  if (buffer.length < 8) return false;
  if (buffer.length > 72) return false;
  if (buffer[0] !== 0x30) return false;
  if (buffer[1] !== buffer.length - 2) return false;
  if (buffer[2] !== 0x02) return false;

  var lenR = buffer[3];
  if (lenR === 0) return false;
  if (5 + lenR >= buffer.length) return false;
  if (buffer[4 + lenR] !== 0x02) return false;

  var lenS = buffer[5 + lenR];
  if (lenS === 0) return false;
  if (6 + lenR + lenS !== buffer.length) return false;

  if (buffer[4] & 0x80) return false;
  if (lenR > 1 && buffer[4] === 0x00 && !(buffer[5] & 0x80)) return false;

  if (buffer[lenR + 6] & 0x80) return false;
  if (lenS > 1 && buffer[lenR + 6] === 0x00 && !(buffer[lenR + 7] & 0x80)) return false;
  return true;
}

function decode(buffer) {
  if (buffer.length < 8) throw new Error('DER sequence length is too short');
  if (buffer.length > 72) throw new Error('DER sequence length is too long');
  if (buffer[0] !== 0x30) throw new Error('Expected DER sequence');
  if (buffer[1] !== buffer.length - 2) throw new Error('DER sequence length is invalid');
  if (buffer[2] !== 0x02) throw new Error('Expected DER integer');

  var lenR = buffer[3];
  if (lenR === 0) throw new Error('R length is zero');
  if (5 + lenR >= buffer.length) throw new Error('R length is too long');
  if (buffer[4 + lenR] !== 0x02) throw new Error('Expected DER integer (2)');

  var lenS = buffer[5 + lenR];
  if (lenS === 0) throw new Error('S length is zero');
  if (6 + lenR + lenS !== buffer.length) throw new Error('S length is invalid');

  if (buffer[4] & 0x80) throw new Error('R value is negative');
  if (lenR > 1 && buffer[4] === 0x00 && !(buffer[5] & 0x80)) throw new Error('R value excessively padded');

  if (buffer[lenR + 6] & 0x80) throw new Error('S value is negative');
  if (lenS > 1 && buffer[lenR + 6] === 0x00 && !(buffer[lenR + 7] & 0x80)) throw new Error('S value excessively padded');

  // non-BIP66 - extract R, S values
  return {
    r: buffer.slice(4, 4 + lenR),
    s: buffer.slice(6 + lenR)
  };
}

/*
 * Expects r and s to be positive DER integers.
 *
 * The DER format uses the most significant bit as a sign bit (& 0x80).
 * If the significant bit is set AND the integer is positive, a 0x00 is prepended.
 *
 * Examples:
 *
 *      0 =>     0x00
 *      1 =>     0x01
 *     -1 =>     0xff
 *    127 =>     0x7f
 *   -127 =>     0x81
 *    128 =>   0x0080
 *   -128 =>     0x80
 *    255 =>   0x00ff
 *   -255 =>   0xff01
 *  16300 =>   0x3fac
 * -16300 =>   0xc054
 *  62300 => 0x00f35c
 * -62300 => 0xff0ca4
*/
function encode(r, s) {
  var lenR = r.length;
  var lenS = s.length;
  if (lenR === 0) throw new Error('R length is zero');
  if (lenS === 0) throw new Error('S length is zero');
  if (lenR > 33) throw new Error('R length is too long');
  if (lenS > 33) throw new Error('S length is too long');
  if (r[0] & 0x80) throw new Error('R value is negative');
  if (s[0] & 0x80) throw new Error('S value is negative');
  if (lenR > 1 && r[0] === 0x00 && !(r[1] & 0x80)) throw new Error('R value excessively padded');
  if (lenS > 1 && s[0] === 0x00 && !(s[1] & 0x80)) throw new Error('S value excessively padded');

  var signature = Buffer.allocUnsafe(6 + lenR + lenS);

  // 0x30 [total-length] 0x02 [R-length] [R] 0x02 [S-length] [S]
  signature[0] = 0x30;
  signature[1] = signature.length - 2;
  signature[2] = 0x02;
  signature[3] = r.length;
  r.copy(signature, 4);
  signature[4 + lenR] = 0x02;
  signature[5 + lenR] = s.length;
  s.copy(signature, 6 + lenR);

  return signature;
}

module.exports = {
  check: check,
  decode: decode,
  encode: encode
};

},{"safe-buffer":591}],41:[function(require,module,exports){
module.exports={
  "OP_FALSE": 0,
  "OP_0": 0,
  "OP_PUSHDATA1": 76,
  "OP_PUSHDATA2": 77,
  "OP_PUSHDATA4": 78,
  "OP_1NEGATE": 79,
  "OP_RESERVED": 80,
  "OP_TRUE": 81,
  "OP_1": 81,
  "OP_2": 82,
  "OP_3": 83,
  "OP_4": 84,
  "OP_5": 85,
  "OP_6": 86,
  "OP_7": 87,
  "OP_8": 88,
  "OP_9": 89,
  "OP_10": 90,
  "OP_11": 91,
  "OP_12": 92,
  "OP_13": 93,
  "OP_14": 94,
  "OP_15": 95,
  "OP_16": 96,

  "OP_NOP": 97,
  "OP_VER": 98,
  "OP_IF": 99,
  "OP_NOTIF": 100,
  "OP_VERIF": 101,
  "OP_VERNOTIF": 102,
  "OP_ELSE": 103,
  "OP_ENDIF": 104,
  "OP_VERIFY": 105,
  "OP_RETURN": 106,

  "OP_TOALTSTACK": 107,
  "OP_FROMALTSTACK": 108,
  "OP_2DROP": 109,
  "OP_2DUP": 110,
  "OP_3DUP": 111,
  "OP_2OVER": 112,
  "OP_2ROT": 113,
  "OP_2SWAP": 114,
  "OP_IFDUP": 115,
  "OP_DEPTH": 116,
  "OP_DROP": 117,
  "OP_DUP": 118,
  "OP_NIP": 119,
  "OP_OVER": 120,
  "OP_PICK": 121,
  "OP_ROLL": 122,
  "OP_ROT": 123,
  "OP_SWAP": 124,
  "OP_TUCK": 125,

  "OP_CAT": 126,
  "OP_SUBSTR": 127,
  "OP_LEFT": 128,
  "OP_RIGHT": 129,
  "OP_SIZE": 130,

  "OP_INVERT": 131,
  "OP_AND": 132,
  "OP_OR": 133,
  "OP_XOR": 134,
  "OP_EQUAL": 135,
  "OP_EQUALVERIFY": 136,
  "OP_RESERVED1": 137,
  "OP_RESERVED2": 138,

  "OP_1ADD": 139,
  "OP_1SUB": 140,
  "OP_2MUL": 141,
  "OP_2DIV": 142,
  "OP_NEGATE": 143,
  "OP_ABS": 144,
  "OP_NOT": 145,
  "OP_0NOTEQUAL": 146,
  "OP_ADD": 147,
  "OP_SUB": 148,
  "OP_MUL": 149,
  "OP_DIV": 150,
  "OP_MOD": 151,
  "OP_LSHIFT": 152,
  "OP_RSHIFT": 153,

  "OP_BOOLAND": 154,
  "OP_BOOLOR": 155,
  "OP_NUMEQUAL": 156,
  "OP_NUMEQUALVERIFY": 157,
  "OP_NUMNOTEQUAL": 158,
  "OP_LESSTHAN": 159,
  "OP_GREATERTHAN": 160,
  "OP_LESSTHANOREQUAL": 161,
  "OP_GREATERTHANOREQUAL": 162,
  "OP_MIN": 163,
  "OP_MAX": 164,

  "OP_WITHIN": 165,

  "OP_RIPEMD160": 166,
  "OP_SHA1": 167,
  "OP_SHA256": 168,
  "OP_HASH160": 169,
  "OP_HASH256": 170,
  "OP_CODESEPARATOR": 171,
  "OP_CHECKSIG": 172,
  "OP_CHECKSIGVERIFY": 173,
  "OP_CHECKMULTISIG": 174,
  "OP_CHECKMULTISIGVERIFY": 175,

  "OP_NOP1": 176,
  
  "OP_NOP2": 177,
  "OP_CHECKLOCKTIMEVERIFY": 177,

  "OP_NOP3": 178,
  "OP_CHECKSEQUENCEVERIFY": 178,
  
  "OP_NOP4": 179,
  "OP_NOP5": 180,
  "OP_NOP6": 181,
  "OP_NOP7": 182,
  "OP_NOP8": 183,
  "OP_NOP9": 184,
  "OP_NOP10": 185,

  "OP_PUBKEYHASH": 253,
  "OP_PUBKEY": 254,
  "OP_INVALIDOPCODE": 255
}

},{}],42:[function(require,module,exports){
'use strict';

var OPS = require('./index.json');

var map = {};
for (var op in OPS) {
  var code = OPS[op];
  map[code] = op;
}

module.exports = map;

},{"./index.json":41}],43:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var bech32 = require('bech32');
var bs58check = require('bs58check');
var bscript = require('./script');
var btemplates = require('./templates');
var networks = require('./networks');
var typeforce = require('typeforce');
var types = require('./types');

function fromBase58Check(address) {
  var payload = bs58check.decode(address);

  // TODO: 4.0.0, move to "toOutputScript"
  if (payload.length < 21) throw new TypeError(address + ' is too short');
  if (payload.length > 22) throw new TypeError(address + ' is too long');

  var multibyte = payload.length === 22;
  var offset = multibyte ? 2 : 1;

  var version = multibyte ? payload.readUInt16BE(0) : payload.readUInt8(0);
  var hash = payload.slice(offset);

  return { version: version, hash: hash };
}

function fromBech32(address) {
  var result = bech32.decode(address);
  var data = bech32.fromWords(result.words.slice(1));

  return {
    version: result.words[0],
    prefix: result.prefix,
    data: Buffer.from(data)
  };
}

function toBase58Check(hash, version) {
  typeforce(types.tuple(types.Hash160bit, types.UInt16), arguments);

  var multibyte = version > 0xff;
  var size = multibyte ? 22 : 21;
  var offset = multibyte ? 2 : 1;

  var payload = Buffer.allocUnsafe(size);
  multibyte ? payload.writeUInt16BE(version, 0) : payload.writeUInt8(version, 0);
  hash.copy(payload, offset);

  return bs58check.encode(payload);
}

function toBech32(data, version, prefix) {
  var words = bech32.toWords(data);
  words.unshift(version);

  return bech32.encode(prefix, words);
}

function fromOutputScript(outputScript, network) {
  network = network || networks.bitcoin;

  if (btemplates.pubKeyHash.output.check(outputScript)) return toBase58Check(bscript.compile(outputScript).slice(3, 23), network.pubKeyHash);
  if (btemplates.scriptHash.output.check(outputScript)) return toBase58Check(bscript.compile(outputScript).slice(2, 22), network.scriptHash);
  if (btemplates.witnessPubKeyHash.output.check(outputScript)) return toBech32(bscript.compile(outputScript).slice(2, 22), 0, network.bech32);
  if (btemplates.witnessScriptHash.output.check(outputScript)) return toBech32(bscript.compile(outputScript).slice(2, 34), 0, network.bech32);

  throw new Error(bscript.toASM(outputScript) + ' has no matching Address');
}

function toOutputScript(address, network) {
  network = network || networks.bitcoin;

  var decode;
  try {
    decode = fromBase58Check(address);
  } catch (e) {}

  if (decode) {
    if (decode.version === network.pubKeyHash) return btemplates.pubKeyHash.output.encode(decode.hash);
    if (decode.version === network.scriptHash) return btemplates.scriptHash.output.encode(decode.hash);
  } else {
    try {
      decode = fromBech32(address);
    } catch (e) {}

    if (decode) {
      if (decode.prefix !== network.bech32) throw new Error(address + ' has an invalid prefix');
      if (decode.version === 0) {
        if (decode.data.length === 20) return btemplates.witnessPubKeyHash.output.encode(decode.data);
        if (decode.data.length === 32) return btemplates.witnessScriptHash.output.encode(decode.data);
      }
    }
  }

  throw new Error(address + ' has no matching Script');
}

module.exports = {
  fromBase58Check: fromBase58Check,
  fromBech32: fromBech32,
  fromOutputScript: fromOutputScript,
  toBase58Check: toBase58Check,
  toBech32: toBech32,
  toOutputScript: toOutputScript
};

},{"./networks":52,"./script":53,"./templates":55,"./types":79,"bech32":35,"bs58check":120,"safe-buffer":591,"typeforce":605}],44:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var bcrypto = require('./crypto');
var fastMerkleRoot = require('merkle-lib/fastRoot');
var typeforce = require('typeforce');
var types = require('./types');
var varuint = require('varuint-bitcoin');

var Transaction = require('./transaction');

function Block() {
  this.version = 1;
  this.prevHash = null;
  this.merkleRoot = null;
  this.timestamp = 0;
  this.bits = 0;
  this.nonce = 0;
}

Block.fromBuffer = function (buffer) {
  if (buffer.length < 80) throw new Error('Buffer too small (< 80 bytes)');

  var offset = 0;
  function readSlice(n) {
    offset += n;
    return buffer.slice(offset - n, offset);
  }

  function readUInt32() {
    var i = buffer.readUInt32LE(offset);
    offset += 4;
    return i;
  }

  function readInt32() {
    var i = buffer.readInt32LE(offset);
    offset += 4;
    return i;
  }

  var block = new Block();
  block.version = readInt32();
  block.prevHash = readSlice(32);
  block.merkleRoot = readSlice(32);
  block.timestamp = readUInt32();
  block.bits = readUInt32();
  block.nonce = readUInt32();

  if (buffer.length === 80) return block;

  function readVarInt() {
    var vi = varuint.decode(buffer, offset);
    offset += varuint.decode.bytes;
    return vi;
  }

  function readTransaction() {
    var tx = Transaction.fromBuffer(buffer.slice(offset), false, true);
    offset += tx.byteLength();
    return tx;
  }

  var nTransactions = readVarInt();
  block.transactions = [];

  for (var i = 0; i < nTransactions; ++i) {
    var tx = readTransaction();
    block.transactions.push(tx);
  }

  return block;
};

Block.prototype.byteLength = function (headersOnly) {
  if (headersOnly || !this.transactions) return 80;

  return 80 + varuint.encodingLength(this.transactions.length) + this.transactions.reduce(function (a, x) {
    return a + x.byteLength();
  }, 0);
};

Block.fromHex = function (hex) {
  return Block.fromBuffer(Buffer.from(hex, 'hex'));
};

Block.prototype.getHash = function () {
  return bcrypto.hash256(this.toBuffer(true));
};

Block.prototype.getId = function () {
  return this.getHash().reverse().toString('hex');
};

Block.prototype.getUTCDate = function () {
  var date = new Date(0); // epoch
  date.setUTCSeconds(this.timestamp);

  return date;
};

// TODO: buffer, offset compatibility
Block.prototype.toBuffer = function (headersOnly) {
  var buffer = Buffer.allocUnsafe(this.byteLength(headersOnly));

  var offset = 0;
  function writeSlice(slice) {
    slice.copy(buffer, offset);
    offset += slice.length;
  }

  function writeInt32(i) {
    buffer.writeInt32LE(i, offset);
    offset += 4;
  }
  function writeUInt32(i) {
    buffer.writeUInt32LE(i, offset);
    offset += 4;
  }

  writeInt32(this.version);
  writeSlice(this.prevHash);
  writeSlice(this.merkleRoot);
  writeUInt32(this.timestamp);
  writeUInt32(this.bits);
  writeUInt32(this.nonce);

  if (headersOnly || !this.transactions) return buffer;

  varuint.encode(this.transactions.length, buffer, offset);
  offset += varuint.encode.bytes;

  this.transactions.forEach(function (tx) {
    var txSize = tx.byteLength(); // TODO: extract from toBuffer?
    tx.toBuffer(buffer, offset);
    offset += txSize;
  });

  return buffer;
};

Block.prototype.toHex = function (headersOnly) {
  return this.toBuffer(headersOnly).toString('hex');
};

Block.calculateTarget = function (bits) {
  var exponent = ((bits & 0xff000000) >> 24) - 3;
  var mantissa = bits & 0x007fffff;
  var target = Buffer.alloc(32, 0);
  target.writeUInt32BE(mantissa, 28 - exponent);
  return target;
};

Block.calculateMerkleRoot = function (transactions) {
  typeforce([{ getHash: types.Function }], transactions);
  if (transactions.length === 0) throw TypeError('Cannot compute merkle root for zero transactions');

  var hashes = transactions.map(function (transaction) {
    return transaction.getHash();
  });

  return fastMerkleRoot(hashes, bcrypto.hash256);
};

Block.prototype.checkMerkleRoot = function () {
  if (!this.transactions) return false;

  var actualMerkleRoot = Block.calculateMerkleRoot(this.transactions);
  return this.merkleRoot.compare(actualMerkleRoot) === 0;
};

Block.prototype.checkProofOfWork = function () {
  var hash = this.getHash().reverse();
  var target = Block.calculateTarget(this.bits);

  return hash.compare(target) <= 0;
};

module.exports = Block;

},{"./crypto":46,"./transaction":77,"./types":79,"merkle-lib/fastRoot":570,"safe-buffer":591,"typeforce":605,"varuint-bitcoin":611}],45:[function(require,module,exports){
'use strict';

var pushdata = require('pushdata-bitcoin');
var varuint = require('varuint-bitcoin');

// https://github.com/feross/buffer/blob/master/index.js#L1127
function verifuint(value, max) {
  if (typeof value !== 'number') throw new Error('cannot write a non-number as a number');
  if (value < 0) throw new Error('specified a negative value for writing an unsigned value');
  if (value > max) throw new Error('RangeError: value out of range');
  if (Math.floor(value) !== value) throw new Error('value has a fractional component');
}

function readUInt64LE(buffer, offset) {
  var a = buffer.readUInt32LE(offset);
  var b = buffer.readUInt32LE(offset + 4);
  b *= 0x100000000;

  verifuint(b + a, 0x001fffffffffffff);

  return b + a;
}

function writeUInt64LE(buffer, value, offset) {
  verifuint(value, 0x001fffffffffffff);

  buffer.writeInt32LE(value & -1, offset);
  buffer.writeUInt32LE(Math.floor(value / 0x100000000), offset + 4);
  return offset + 8;
}

// TODO: remove in 4.0.0?
function readVarInt(buffer, offset) {
  var result = varuint.decode(buffer, offset);

  return {
    number: result,
    size: varuint.decode.bytes
  };
}

// TODO: remove in 4.0.0?
function writeVarInt(buffer, number, offset) {
  varuint.encode(number, buffer, offset);
  return varuint.encode.bytes;
}

module.exports = {
  pushDataSize: pushdata.encodingLength,
  readPushDataInt: pushdata.decode,
  readUInt64LE: readUInt64LE,
  readVarInt: readVarInt,
  varIntBuffer: varuint.encode,
  varIntSize: varuint.encodingLength,
  writePushDataInt: pushdata.encode,
  writeUInt64LE: writeUInt64LE,
  writeVarInt: writeVarInt
};

},{"pushdata-bitcoin":573,"varuint-bitcoin":611}],46:[function(require,module,exports){
'use strict';

var createHash = require('create-hash');

function ripemd160(buffer) {
  return createHash('rmd160').update(buffer).digest();
}

function sha1(buffer) {
  return createHash('sha1').update(buffer).digest();
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest();
}

function hash160(buffer) {
  return ripemd160(sha256(buffer));
}

function hash256(buffer) {
  return sha256(sha256(buffer));
}

module.exports = {
  hash160: hash160,
  hash256: hash256,
  ripemd160: ripemd160,
  sha1: sha1,
  sha256: sha256
};

},{"create-hash":553}],47:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var createHmac = require('create-hmac');
var typeforce = require('typeforce');
var types = require('./types');

var BigInteger = require('bigi');
var ECSignature = require('./ecsignature');

var ZERO = Buffer.alloc(1, 0);
var ONE = Buffer.alloc(1, 1);

var ecurve = require('ecurve');
var secp256k1 = ecurve.getCurveByName('secp256k1');

// https://tools.ietf.org/html/rfc6979#section-3.2
function deterministicGenerateK(hash, x, checkSig) {
  typeforce(types.tuple(types.Hash256bit, types.Buffer256bit, types.Function), arguments);

  // Step A, ignored as hash already provided
  // Step B
  // Step C
  var k = Buffer.alloc(32, 0);
  var v = Buffer.alloc(32, 1);

  // Step D
  k = createHmac('sha256', k).update(v).update(ZERO).update(x).update(hash).digest();

  // Step E
  v = createHmac('sha256', k).update(v).digest();

  // Step F
  k = createHmac('sha256', k).update(v).update(ONE).update(x).update(hash).digest();

  // Step G
  v = createHmac('sha256', k).update(v).digest();

  // Step H1/H2a, ignored as tlen === qlen (256 bit)
  // Step H2b
  v = createHmac('sha256', k).update(v).digest();

  var T = BigInteger.fromBuffer(v);

  // Step H3, repeat until T is within the interval [1, n - 1] and is suitable for ECDSA
  while (T.signum() <= 0 || T.compareTo(secp256k1.n) >= 0 || !checkSig(T)) {
    k = createHmac('sha256', k).update(v).update(ZERO).digest();

    v = createHmac('sha256', k).update(v).digest();

    // Step H1/H2a, again, ignored as tlen === qlen (256 bit)
    // Step H2b again
    v = createHmac('sha256', k).update(v).digest();
    T = BigInteger.fromBuffer(v);
  }

  return T;
}

var N_OVER_TWO = secp256k1.n.shiftRight(1);

function sign(hash, d) {
  typeforce(types.tuple(types.Hash256bit, types.BigInt), arguments);

  var x = d.toBuffer(32);
  var e = BigInteger.fromBuffer(hash);
  var n = secp256k1.n;
  var G = secp256k1.G;

  var r, s;
  deterministicGenerateK(hash, x, function (k) {
    var Q = G.multiply(k);

    if (secp256k1.isInfinity(Q)) return false;

    r = Q.affineX.mod(n);
    if (r.signum() === 0) return false;

    s = k.modInverse(n).multiply(e.add(d.multiply(r))).mod(n);
    if (s.signum() === 0) return false;

    return true;
  });

  // enforce low S values, see bip62: 'low s values in signatures'
  if (s.compareTo(N_OVER_TWO) > 0) {
    s = n.subtract(s);
  }

  return new ECSignature(r, s);
}

function verify(hash, signature, Q) {
  typeforce(types.tuple(types.Hash256bit, types.ECSignature, types.ECPoint), arguments);

  var n = secp256k1.n;
  var G = secp256k1.G;

  var r = signature.r;
  var s = signature.s;

  // 1.4.1 Enforce r and s are both integers in the interval [1, n − 1]
  if (r.signum() <= 0 || r.compareTo(n) >= 0) return false;
  if (s.signum() <= 0 || s.compareTo(n) >= 0) return false;

  // 1.4.2 H = Hash(M), already done by the user
  // 1.4.3 e = H
  var e = BigInteger.fromBuffer(hash);

  // Compute s^-1
  var sInv = s.modInverse(n);

  // 1.4.4 Compute u1 = es^−1 mod n
  //               u2 = rs^−1 mod n
  var u1 = e.multiply(sInv).mod(n);
  var u2 = r.multiply(sInv).mod(n);

  // 1.4.5 Compute R = (xR, yR)
  //               R = u1G + u2Q
  var R = G.multiplyTwo(u1, Q, u2);

  // 1.4.5 (cont.) Enforce R is not at infinity
  if (secp256k1.isInfinity(R)) return false;

  // 1.4.6 Convert the field element R.x to an integer
  var xR = R.affineX;

  // 1.4.7 Set v = xR mod n
  var v = xR.mod(n);

  // 1.4.8 If v = r, output "valid", and if v != r, output "invalid"
  return v.equals(r);
}

module.exports = {
  deterministicGenerateK: deterministicGenerateK,
  sign: sign,
  verify: verify,

  // TODO: remove
  __curve: secp256k1
};

},{"./ecsignature":49,"./types":79,"bigi":38,"create-hmac":555,"ecurve":559,"safe-buffer":591,"typeforce":605}],48:[function(require,module,exports){
'use strict';

var baddress = require('./address');
var bcrypto = require('./crypto');
var ecdsa = require('./ecdsa');
var randomBytes = require('randombytes');
var typeforce = require('typeforce');
var types = require('./types');
var wif = require('wif');

var NETWORKS = require('./networks');
var BigInteger = require('bigi');

var ecurve = require('ecurve');
var secp256k1 = ecdsa.__curve;

function ECPair(d, Q, options) {
  if (options) {
    typeforce({
      compressed: types.maybe(types.Boolean),
      network: types.maybe(types.Network)
    }, options);
  }

  options = options || {};

  if (d) {
    if (d.signum() <= 0) throw new Error('Private key must be greater than 0');
    if (d.compareTo(secp256k1.n) >= 0) throw new Error('Private key must be less than the curve order');
    if (Q) throw new TypeError('Unexpected publicKey parameter');

    this.d = d;
  } else {
    typeforce(types.ECPoint, Q);

    this.__Q = Q;
  }

  this.compressed = options.compressed === undefined ? true : options.compressed;
  this.network = options.network || NETWORKS.bitcoin;
}

Object.defineProperty(ECPair.prototype, 'Q', {
  get: function get() {
    if (!this.__Q && this.d) {
      this.__Q = secp256k1.G.multiply(this.d);
    }

    return this.__Q;
  }
});

ECPair.fromPublicKeyBuffer = function (buffer, network) {
  var Q = ecurve.Point.decodeFrom(secp256k1, buffer);

  return new ECPair(null, Q, {
    compressed: Q.compressed,
    network: network
  });
};

ECPair.fromWIF = function (string, network) {
  var decoded = wif.decode(string);
  var version = decoded.version;

  // list of networks?
  if (types.Array(network)) {
    network = network.filter(function (x) {
      return version === x.wif;
    }).pop();

    if (!network) throw new Error('Unknown network version');

    // otherwise, assume a network object (or default to bitcoin)
  } else {
    network = network || NETWORKS.bitcoin;

    if (version !== network.wif) throw new Error('Invalid network version');
  }

  var d = BigInteger.fromBuffer(decoded.privateKey);

  return new ECPair(d, null, {
    compressed: decoded.compressed,
    network: network
  });
};

ECPair.makeRandom = function (options) {
  options = options || {};

  var rng = options.rng || randomBytes;

  var d;
  do {
    var buffer = rng(32);
    typeforce(types.Buffer256bit, buffer);

    d = BigInteger.fromBuffer(buffer);
  } while (d.signum() <= 0 || d.compareTo(secp256k1.n) >= 0);

  return new ECPair(d, null, options);
};

ECPair.prototype.getAddress = function () {
  return baddress.toBase58Check(bcrypto.hash160(this.getPublicKeyBuffer()), this.getNetwork().pubKeyHash);
};

ECPair.prototype.getNetwork = function () {
  return this.network;
};

ECPair.prototype.getPublicKeyBuffer = function () {
  return this.Q.getEncoded(this.compressed);
};

ECPair.prototype.sign = function (hash) {
  if (!this.d) throw new Error('Missing private key');

  return ecdsa.sign(hash, this.d);
};

ECPair.prototype.toWIF = function () {
  if (!this.d) throw new Error('Missing private key');

  return wif.encode(this.network.wif, this.d.toBuffer(32), this.compressed);
};

ECPair.prototype.verify = function (hash, signature) {
  return ecdsa.verify(hash, signature, this.Q);
};

module.exports = ECPair;

},{"./address":43,"./crypto":46,"./ecdsa":47,"./networks":52,"./types":79,"bigi":38,"ecurve":559,"randombytes":574,"typeforce":605,"wif":612}],49:[function(require,module,exports){
(function (Buffer){
'use strict';

var bip66 = require('bip66');
var typeforce = require('typeforce');
var types = require('./types');

var BigInteger = require('bigi');

function ECSignature(r, s) {
  typeforce(types.tuple(types.BigInt, types.BigInt), arguments);

  this.r = r;
  this.s = s;
}

ECSignature.parseCompact = function (buffer) {
  typeforce(types.BufferN(65), buffer);

  var flagByte = buffer.readUInt8(0) - 27;
  if (flagByte !== (flagByte & 7)) throw new Error('Invalid signature parameter');

  var compressed = !!(flagByte & 4);
  var recoveryParam = flagByte & 3;
  var signature = ECSignature.fromRSBuffer(buffer.slice(1));

  return {
    compressed: compressed,
    i: recoveryParam,
    signature: signature
  };
};

ECSignature.fromRSBuffer = function (buffer) {
  typeforce(types.BufferN(64), buffer);

  var r = BigInteger.fromBuffer(buffer.slice(0, 32));
  var s = BigInteger.fromBuffer(buffer.slice(32, 64));
  return new ECSignature(r, s);
};

ECSignature.fromDER = function (buffer) {
  var decode = bip66.decode(buffer);
  var r = BigInteger.fromDERInteger(decode.r);
  var s = BigInteger.fromDERInteger(decode.s);

  return new ECSignature(r, s);
};

// BIP62: 1 byte hashType flag (only 0x01, 0x02, 0x03, 0x81, 0x82 and 0x83 are allowed)
ECSignature.parseScriptSignature = function (buffer) {
  var hashType = buffer.readUInt8(buffer.length - 1);
  var hashTypeMod = hashType & ~0x80;

  if (hashTypeMod <= 0x00 || hashTypeMod >= 0x04) throw new Error('Invalid hashType ' + hashType);

  return {
    signature: ECSignature.fromDER(buffer.slice(0, -1)),
    hashType: hashType
  };
};

ECSignature.prototype.toCompact = function (i, compressed) {
  if (compressed) {
    i += 4;
  }

  i += 27;

  var buffer = Buffer.alloc(65);
  buffer.writeUInt8(i, 0);
  this.toRSBuffer(buffer, 1);
  return buffer;
};

ECSignature.prototype.toDER = function () {
  var r = Buffer.from(this.r.toDERInteger());
  var s = Buffer.from(this.s.toDERInteger());

  return bip66.encode(r, s);
};

ECSignature.prototype.toRSBuffer = function (buffer, offset) {
  buffer = buffer || Buffer.alloc(64);
  this.r.toBuffer(32).copy(buffer, offset);
  this.s.toBuffer(32).copy(buffer, offset + 32);
  return buffer;
};

ECSignature.prototype.toScriptSignature = function (hashType) {
  var hashTypeMod = hashType & ~0x80;
  if (hashTypeMod <= 0 || hashTypeMod >= 4) throw new Error('Invalid hashType ' + hashType);

  var hashTypeBuffer = Buffer.alloc(1);
  hashTypeBuffer.writeUInt8(hashType, 0);

  return Buffer.concat([this.toDER(), hashTypeBuffer]);
};

module.exports = ECSignature;

}).call(this,require("buffer").Buffer)
},{"./types":79,"bigi":38,"bip66":40,"buffer":121,"typeforce":605}],50:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var base58check = require('bs58check');
var bcrypto = require('./crypto');
var createHmac = require('create-hmac');
var typeforce = require('typeforce');
var types = require('./types');
var NETWORKS = require('./networks');

var BigInteger = require('bigi');
var ECPair = require('./ecpair');

var ecurve = require('ecurve');
var curve = ecurve.getCurveByName('secp256k1');

function HDNode(keyPair, chainCode) {
  typeforce(types.tuple('ECPair', types.Buffer256bit), arguments);

  if (!keyPair.compressed) throw new TypeError('BIP32 only allows compressed keyPairs');

  this.keyPair = keyPair;
  this.chainCode = chainCode;
  this.depth = 0;
  this.index = 0;
  this.parentFingerprint = 0x00000000;
}

HDNode.HIGHEST_BIT = 0x80000000;
HDNode.LENGTH = 78;
HDNode.MASTER_SECRET = Buffer.from('Bitcoin seed', 'utf8');

HDNode.fromSeedBuffer = function (seed, network) {
  typeforce(types.tuple(types.Buffer, types.maybe(types.Network)), arguments);

  if (seed.length < 16) throw new TypeError('Seed should be at least 128 bits');
  if (seed.length > 64) throw new TypeError('Seed should be at most 512 bits');

  var I = createHmac('sha512', HDNode.MASTER_SECRET).update(seed).digest();
  var IL = I.slice(0, 32);
  var IR = I.slice(32);

  // In case IL is 0 or >= n, the master key is invalid
  // This is handled by the ECPair constructor
  var pIL = BigInteger.fromBuffer(IL);
  var keyPair = new ECPair(pIL, null, {
    network: network
  });

  return new HDNode(keyPair, IR);
};

HDNode.fromSeedHex = function (hex, network) {
  return HDNode.fromSeedBuffer(Buffer.from(hex, 'hex'), network);
};

HDNode.fromBase58 = function (string, networks, skipValidation) {
  var buffer = base58check.decode(string);
  if (buffer.length !== 78) throw new Error('Invalid buffer length');

  // 4 bytes: version bytes
  var version = buffer.readUInt32BE(0);
  var network;

  // list of networks?
  if (Array.isArray(networks)) {
    network = networks.filter(function (x) {
      return version === x.bip32.private || version === x.bip32.public;
    }).pop();

    if (!network) throw new Error('Unknown network version');

    // otherwise, assume a network object (or default to bitcoin)
  } else {
    network = networks || NETWORKS.bitcoin;
  }

  if (version !== network.bip32.private && version !== network.bip32.public) throw new Error('Invalid network version');

  // 1 byte: depth: 0x00 for master nodes, 0x01 for level-1 descendants, ...
  var depth = buffer[4];

  // 4 bytes: the fingerprint of the parent's key (0x00000000 if master key)
  var parentFingerprint = buffer.readUInt32BE(5);
  if (depth === 0) {
    if (parentFingerprint !== 0x00000000) throw new Error('Invalid parent fingerprint');
  }

  // 4 bytes: child number. This is the number i in xi = xpar/i, with xi the key being serialized.
  // This is encoded in MSB order. (0x00000000 if master key)
  var index = buffer.readUInt32BE(9);
  if (depth === 0 && index !== 0) throw new Error('Invalid index');

  // 32 bytes: the chain code
  var chainCode = buffer.slice(13, 45);
  var keyPair;

  // 33 bytes: private key data (0x00 + k)
  if (version === network.bip32.private) {
    if (buffer.readUInt8(45) !== 0x00) throw new Error('Invalid private key');

    var d = BigInteger.fromBuffer(buffer.slice(46, 78));
    keyPair = new ECPair(d, null, { network: network });

    // 33 bytes: public key data (0x02 + X or 0x03 + X)
  } else {
    var Q = ecurve.Point.decodeFrom(curve, buffer.slice(45, 78));
    // Q.compressed is assumed, if somehow this assumption is broken, `new HDNode` will throw

    // Skip validation if requested for efficiency
    if (!skipValidation) {
      // Verify that the X coordinate in the public point corresponds to a point on the curve.
      // If not, the extended public key is invalid.
      curve.validate(Q);
    }

    keyPair = new ECPair(null, Q, { network: network });
  }

  var hd = new HDNode(keyPair, chainCode);
  hd.depth = depth;
  hd.index = index;
  hd.parentFingerprint = parentFingerprint;

  return hd;
};

HDNode.prototype.getAddress = function () {
  return this.keyPair.getAddress();
};

HDNode.prototype.getIdentifier = function () {
  return bcrypto.hash160(this.keyPair.getPublicKeyBuffer());
};

HDNode.prototype.getFingerprint = function () {
  return this.getIdentifier().slice(0, 4);
};

HDNode.prototype.getNetwork = function () {
  return this.keyPair.getNetwork();
};

HDNode.prototype.getPublicKeyBuffer = function () {
  return this.keyPair.getPublicKeyBuffer();
};

HDNode.prototype.neutered = function () {
  var neuteredKeyPair = new ECPair(null, this.keyPair.Q, {
    network: this.keyPair.network
  });

  var neutered = new HDNode(neuteredKeyPair, this.chainCode);
  neutered.depth = this.depth;
  neutered.index = this.index;
  neutered.parentFingerprint = this.parentFingerprint;

  return neutered;
};

HDNode.prototype.sign = function (hash) {
  return this.keyPair.sign(hash);
};

HDNode.prototype.verify = function (hash, signature) {
  return this.keyPair.verify(hash, signature);
};

HDNode.prototype.toBase58 = function (__isPrivate) {
  if (__isPrivate !== undefined) throw new TypeError('Unsupported argument in 2.0.0');

  // Version
  var network = this.keyPair.network;
  var version = !this.isNeutered() ? network.bip32.private : network.bip32.public;
  var buffer = Buffer.allocUnsafe(78);

  // 4 bytes: version bytes
  buffer.writeUInt32BE(version, 0);

  // 1 byte: depth: 0x00 for master nodes, 0x01 for level-1 descendants, ....
  buffer.writeUInt8(this.depth, 4);

  // 4 bytes: the fingerprint of the parent's key (0x00000000 if master key)
  buffer.writeUInt32BE(this.parentFingerprint, 5);

  // 4 bytes: child number. This is the number i in xi = xpar/i, with xi the key being serialized.
  // This is encoded in big endian. (0x00000000 if master key)
  buffer.writeUInt32BE(this.index, 9);

  // 32 bytes: the chain code
  this.chainCode.copy(buffer, 13);

  // 33 bytes: the public key or private key data
  if (!this.isNeutered()) {
    // 0x00 + k for private keys
    buffer.writeUInt8(0, 45);
    this.keyPair.d.toBuffer(32).copy(buffer, 46);

    // 33 bytes: the public key
  } else {
    // X9.62 encoding for public keys
    this.keyPair.getPublicKeyBuffer().copy(buffer, 45);
  }

  return base58check.encode(buffer);
};

// https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki#child-key-derivation-ckd-functions
HDNode.prototype.derive = function (index) {
  typeforce(types.UInt32, index);

  var isHardened = index >= HDNode.HIGHEST_BIT;
  var data = Buffer.allocUnsafe(37);

  // Hardened child
  if (isHardened) {
    if (this.isNeutered()) throw new TypeError('Could not derive hardened child key');

    // data = 0x00 || ser256(kpar) || ser32(index)
    data[0] = 0x00;
    this.keyPair.d.toBuffer(32).copy(data, 1);
    data.writeUInt32BE(index, 33);

    // Normal child
  } else {
    // data = serP(point(kpar)) || ser32(index)
    //      = serP(Kpar) || ser32(index)
    this.keyPair.getPublicKeyBuffer().copy(data, 0);
    data.writeUInt32BE(index, 33);
  }

  var I = createHmac('sha512', this.chainCode).update(data).digest();
  var IL = I.slice(0, 32);
  var IR = I.slice(32);

  var pIL = BigInteger.fromBuffer(IL);

  // In case parse256(IL) >= n, proceed with the next value for i
  if (pIL.compareTo(curve.n) >= 0) {
    return this.derive(index + 1);
  }

  // Private parent key -> private child key
  var derivedKeyPair;
  if (!this.isNeutered()) {
    // ki = parse256(IL) + kpar (mod n)
    var ki = pIL.add(this.keyPair.d).mod(curve.n);

    // In case ki == 0, proceed with the next value for i
    if (ki.signum() === 0) {
      return this.derive(index + 1);
    }

    derivedKeyPair = new ECPair(ki, null, {
      network: this.keyPair.network
    });

    // Public parent key -> public child key
  } else {
    // Ki = point(parse256(IL)) + Kpar
    //    = G*IL + Kpar
    var Ki = curve.G.multiply(pIL).add(this.keyPair.Q);

    // In case Ki is the point at infinity, proceed with the next value for i
    if (curve.isInfinity(Ki)) {
      return this.derive(index + 1);
    }

    derivedKeyPair = new ECPair(null, Ki, {
      network: this.keyPair.network
    });
  }

  var hd = new HDNode(derivedKeyPair, IR);
  hd.depth = this.depth + 1;
  hd.index = index;
  hd.parentFingerprint = this.getFingerprint().readUInt32BE(0);

  return hd;
};

HDNode.prototype.deriveHardened = function (index) {
  typeforce(types.UInt31, index);

  // Only derives hardened private keys by default
  return this.derive(index + HDNode.HIGHEST_BIT);
};

// Private === not neutered
// Public === neutered
HDNode.prototype.isNeutered = function () {
  return !this.keyPair.d;
};

HDNode.prototype.derivePath = function (path) {
  typeforce(types.BIP32Path, path);

  var splitPath = path.split('/');
  if (splitPath[0] === 'm') {
    if (this.parentFingerprint) {
      throw new Error('Not a master node');
    }

    splitPath = splitPath.slice(1);
  }

  return splitPath.reduce(function (prevHd, indexStr) {
    var index;
    if (indexStr.slice(-1) === "'") {
      index = parseInt(indexStr.slice(0, -1), 10);
      return prevHd.deriveHardened(index);
    } else {
      index = parseInt(indexStr, 10);
      return prevHd.derive(index);
    }
  }, this);
};

module.exports = HDNode;

},{"./crypto":46,"./ecpair":48,"./networks":52,"./types":79,"bigi":38,"bs58check":120,"create-hmac":555,"ecurve":559,"safe-buffer":591,"typeforce":605}],51:[function(require,module,exports){
'use strict';

var script = require('./script');

var templates = require('./templates');
for (var key in templates) {
  script[key] = templates[key];
}

module.exports = {
  bufferutils: require('./bufferutils'), // TODO: remove in 4.0.0

  Block: require('./block'),
  ECPair: require('./ecpair'),
  ECSignature: require('./ecsignature'),
  HDNode: require('./hdnode'),
  Transaction: require('./transaction'),
  TransactionBuilder: require('./transaction_builder'),

  address: require('./address'),
  crypto: require('./crypto'),
  networks: require('./networks'),
  opcodes: require('bitcoin-ops'),
  script: script
};

},{"./address":43,"./block":44,"./bufferutils":45,"./crypto":46,"./ecpair":48,"./ecsignature":49,"./hdnode":50,"./networks":52,"./script":53,"./templates":55,"./transaction":77,"./transaction_builder":78,"bitcoin-ops":41}],52:[function(require,module,exports){
'use strict';

// https://en.bitcoin.it/wiki/List_of_address_prefixes
// Dogecoin BIP32 is a proposed standard: https://bitcointalk.org/index.php?topic=409731

module.exports = {
  bitcoin: {
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bech32: 'bc',
    bip32: {
      public: 0x0488b21e,
      private: 0x0488ade4
    },
    pubKeyHash: 0x00,
    scriptHash: 0x05,
    wif: 0x80
  },
  testnet: {
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bech32: 'tb',
    bip32: {
      public: 0x043587cf,
      private: 0x04358394
    },
    pubKeyHash: 0x6f,
    scriptHash: 0xc4,
    wif: 0xef
  },
  litecoin: {
    messagePrefix: '\x19Litecoin Signed Message:\n',
    bip32: {
      public: 0x019da462,
      private: 0x019d9cfe
    },
    pubKeyHash: 0x30,
    scriptHash: 0x32,
    wif: 0xb0
  }
};

},{}],53:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var bip66 = require('bip66');
var pushdata = require('pushdata-bitcoin');
var typeforce = require('typeforce');
var types = require('./types');
var scriptNumber = require('./script_number');

var OPS = require('bitcoin-ops');
var REVERSE_OPS = require('bitcoin-ops/map');
var OP_INT_BASE = OPS.OP_RESERVED; // OP_1 - 1

function isOPInt(value) {
  return types.Number(value) && (value === OPS.OP_0 || value >= OPS.OP_1 && value <= OPS.OP_16 || value === OPS.OP_1NEGATE);
}

function isPushOnlyChunk(value) {
  return types.Buffer(value) || isOPInt(value);
}

function isPushOnly(value) {
  return types.Array(value) && value.every(isPushOnlyChunk);
}

function asMinimalOP(buffer) {
  if (buffer.length === 0) return OPS.OP_0;
  if (buffer.length !== 1) return;
  if (buffer[0] >= 1 && buffer[0] <= 16) return OP_INT_BASE + buffer[0];
  if (buffer[0] === 0x81) return OPS.OP_1NEGATE;
}

function compile(chunks) {
  // TODO: remove me
  if (Buffer.isBuffer(chunks)) return chunks;

  typeforce(types.Array, chunks);

  var bufferSize = chunks.reduce(function (accum, chunk) {
    // data chunk
    if (Buffer.isBuffer(chunk)) {
      // adhere to BIP62.3, minimal push policy
      if (chunk.length === 1 && asMinimalOP(chunk) !== undefined) {
        return accum + 1;
      }

      return accum + pushdata.encodingLength(chunk.length) + chunk.length;
    }

    // opcode
    return accum + 1;
  }, 0.0);

  var buffer = Buffer.allocUnsafe(bufferSize);
  var offset = 0;

  chunks.forEach(function (chunk) {
    // data chunk
    if (Buffer.isBuffer(chunk)) {
      // adhere to BIP62.3, minimal push policy
      var opcode = asMinimalOP(chunk);
      if (opcode !== undefined) {
        buffer.writeUInt8(opcode, offset);
        offset += 1;
        return;
      }

      offset += pushdata.encode(buffer, chunk.length, offset);
      chunk.copy(buffer, offset);
      offset += chunk.length;

      // opcode
    } else {
      buffer.writeUInt8(chunk, offset);
      offset += 1;
    }
  });

  if (offset !== buffer.length) throw new Error('Could not decode chunks');
  return buffer;
}

function decompile(buffer) {
  // TODO: remove me
  if (types.Array(buffer)) return buffer;

  typeforce(types.Buffer, buffer);

  var chunks = [];
  var i = 0;

  while (i < buffer.length) {
    var opcode = buffer[i];

    // data chunk
    if (opcode > OPS.OP_0 && opcode <= OPS.OP_PUSHDATA4) {
      var d = pushdata.decode(buffer, i);

      // did reading a pushDataInt fail? empty script
      if (d === null) return [];
      i += d.size;

      // attempt to read too much data? empty script
      if (i + d.number > buffer.length) return [];

      var data = buffer.slice(i, i + d.number);
      i += d.number;

      // decompile minimally
      var op = asMinimalOP(data);
      if (op !== undefined) {
        chunks.push(op);
      } else {
        chunks.push(data);
      }

      // opcode
    } else {
      chunks.push(opcode);

      i += 1;
    }
  }

  return chunks;
}

function toASM(chunks) {
  if (Buffer.isBuffer(chunks)) {
    chunks = decompile(chunks);
  }

  return chunks.map(function (chunk) {
    // data?
    if (Buffer.isBuffer(chunk)) {
      var op = asMinimalOP(chunk);
      if (op === undefined) return chunk.toString('hex');
      chunk = op;
    }

    // opcode!
    return REVERSE_OPS[chunk];
  }).join(' ');
}

function fromASM(asm) {
  typeforce(types.String, asm);

  return compile(asm.split(' ').map(function (chunkStr) {
    // opcode?
    if (OPS[chunkStr] !== undefined) return OPS[chunkStr];
    typeforce(types.Hex, chunkStr);

    // data!
    return Buffer.from(chunkStr, 'hex');
  }));
}

function toStack(chunks) {
  chunks = decompile(chunks);
  typeforce(isPushOnly, chunks);

  return chunks.map(function (op) {
    if (Buffer.isBuffer(op)) return op;
    if (op === OPS.OP_0) return Buffer.allocUnsafe(0);

    return scriptNumber.encode(op - OP_INT_BASE);
  });
}

function isCanonicalPubKey(buffer) {
  if (!Buffer.isBuffer(buffer)) return false;
  if (buffer.length < 33) return false;

  switch (buffer[0]) {
    case 0x02:
    case 0x03:
      return buffer.length === 33;
    case 0x04:
      return buffer.length === 65;
  }

  return false;
}

function isDefinedHashType(hashType) {
  var hashTypeMod = hashType & ~0x80;

  // return hashTypeMod > SIGHASH_ALL && hashTypeMod < SIGHASH_SINGLE
  return hashTypeMod > 0x00 && hashTypeMod < 0x04;
}

function isCanonicalSignature(buffer) {
  if (!Buffer.isBuffer(buffer)) return false;
  if (!isDefinedHashType(buffer[buffer.length - 1])) return false;

  return bip66.check(buffer.slice(0, -1));
}

module.exports = {
  compile: compile,
  decompile: decompile,
  fromASM: fromASM,
  toASM: toASM,
  toStack: toStack,

  number: require('./script_number'),

  isCanonicalPubKey: isCanonicalPubKey,
  isCanonicalSignature: isCanonicalSignature,
  isPushOnly: isPushOnly,
  isDefinedHashType: isDefinedHashType
};

},{"./script_number":54,"./types":79,"bip66":40,"bitcoin-ops":41,"bitcoin-ops/map":42,"pushdata-bitcoin":573,"safe-buffer":591,"typeforce":605}],54:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;

function decode(buffer, maxLength, minimal) {
  maxLength = maxLength || 4;
  minimal = minimal === undefined ? true : minimal;

  var length = buffer.length;
  if (length === 0) return 0;
  if (length > maxLength) throw new TypeError('Script number overflow');
  if (minimal) {
    if ((buffer[length - 1] & 0x7f) === 0) {
      if (length <= 1 || (buffer[length - 2] & 0x80) === 0) throw new Error('Non-minimally encoded script number');
    }
  }

  // 40-bit
  if (length === 5) {
    var a = buffer.readUInt32LE(0);
    var b = buffer.readUInt8(4);

    if (b & 0x80) return -((b & ~0x80) * 0x100000000 + a);
    return b * 0x100000000 + a;
  }

  var result = 0;

  // 32-bit / 24-bit / 16-bit / 8-bit
  for (var i = 0; i < length; ++i) {
    result |= buffer[i] << 8 * i;
  }

  if (buffer[length - 1] & 0x80) return -(result & ~(0x80 << 8 * (length - 1)));
  return result;
}

function scriptNumSize(i) {
  return i > 0x7fffffff ? 5 : i > 0x7fffff ? 4 : i > 0x7fff ? 3 : i > 0x7f ? 2 : i > 0x00 ? 1 : 0;
}

function encode(number) {
  var value = Math.abs(number);
  var size = scriptNumSize(value);
  var buffer = Buffer.allocUnsafe(size);
  var negative = number < 0;

  for (var i = 0; i < size; ++i) {
    buffer.writeUInt8(value & 0xff, i);
    value >>= 8;
  }

  if (buffer[size - 1] & 0x80) {
    buffer.writeUInt8(negative ? 0x80 : 0x00, size - 1);
  } else if (negative) {
    buffer[size - 1] |= 0x80;
  }

  return buffer;
}

module.exports = {
  decode: decode,
  encode: encode
};

},{"safe-buffer":591}],55:[function(require,module,exports){
'use strict';

var decompile = require('../script').decompile;
var multisig = require('./multisig');
var nullData = require('./nulldata');
var pubKey = require('./pubkey');
var pubKeyHash = require('./pubkeyhash');
var scriptHash = require('./scripthash');
var witnessPubKeyHash = require('./witnesspubkeyhash');
var witnessScriptHash = require('./witnessscripthash');
var witnessCommitment = require('./witnesscommitment');

var types = {
  MULTISIG: 'multisig',
  NONSTANDARD: 'nonstandard',
  NULLDATA: 'nulldata',
  P2PK: 'pubkey',
  P2PKH: 'pubkeyhash',
  P2SH: 'scripthash',
  P2WPKH: 'witnesspubkeyhash',
  P2WSH: 'witnessscripthash',
  WITNESS_COMMITMENT: 'witnesscommitment'
};

function classifyOutput(script) {
  if (witnessPubKeyHash.output.check(script)) return types.P2WPKH;
  if (witnessScriptHash.output.check(script)) return types.P2WSH;
  if (pubKeyHash.output.check(script)) return types.P2PKH;
  if (scriptHash.output.check(script)) return types.P2SH;

  // XXX: optimization, below functions .decompile before use
  var chunks = decompile(script);
  if (multisig.output.check(chunks)) return types.MULTISIG;
  if (pubKey.output.check(chunks)) return types.P2PK;
  if (witnessCommitment.output.check(chunks)) return types.WITNESS_COMMITMENT;
  if (nullData.output.check(chunks)) return types.NULLDATA;

  return types.NONSTANDARD;
}

function classifyInput(script, allowIncomplete) {
  // XXX: optimization, below functions .decompile before use
  var chunks = decompile(script);

  if (pubKeyHash.input.check(chunks)) return types.P2PKH;
  if (scriptHash.input.check(chunks, allowIncomplete)) return types.P2SH;
  if (multisig.input.check(chunks, allowIncomplete)) return types.MULTISIG;
  if (pubKey.input.check(chunks)) return types.P2PK;

  return types.NONSTANDARD;
}

function classifyWitness(script, allowIncomplete) {
  // XXX: optimization, below functions .decompile before use
  var chunks = decompile(script);

  if (witnessPubKeyHash.input.check(chunks)) return types.P2WPKH;
  if (witnessScriptHash.input.check(chunks, allowIncomplete)) return types.P2WSH;

  return types.NONSTANDARD;
}

module.exports = {
  classifyInput: classifyInput,
  classifyOutput: classifyOutput,
  classifyWitness: classifyWitness,
  multisig: multisig,
  nullData: nullData,
  pubKey: pubKey,
  pubKeyHash: pubKeyHash,
  scriptHash: scriptHash,
  witnessPubKeyHash: witnessPubKeyHash,
  witnessScriptHash: witnessScriptHash,
  witnessCommitment: witnessCommitment,
  types: types
};

},{"../script":53,"./multisig":56,"./nulldata":59,"./pubkey":60,"./pubkeyhash":63,"./scripthash":66,"./witnesscommitment":69,"./witnesspubkeyhash":71,"./witnessscripthash":74}],56:[function(require,module,exports){
'use strict';

module.exports = {
  input: require('./input'),
  output: require('./output')
};

},{"./input":57,"./output":58}],57:[function(require,module,exports){
'use strict';

// OP_0 [signatures ...]

var Buffer = require('safe-buffer').Buffer;
var bscript = require('../../script');
var p2mso = require('./output');
var typeforce = require('typeforce');
var OPS = require('bitcoin-ops');

function partialSignature(value) {
  return value === OPS.OP_0 || bscript.isCanonicalSignature(value);
}

function check(script, allowIncomplete) {
  var chunks = bscript.decompile(script);
  if (chunks.length < 2) return false;
  if (chunks[0] !== OPS.OP_0) return false;

  if (allowIncomplete) {
    return chunks.slice(1).every(partialSignature);
  }

  return chunks.slice(1).every(bscript.isCanonicalSignature);
}
check.toJSON = function () {
  return 'multisig input';
};

var EMPTY_BUFFER = Buffer.allocUnsafe(0);

function encodeStack(signatures, scriptPubKey) {
  typeforce([partialSignature], signatures);

  if (scriptPubKey) {
    var scriptData = p2mso.decode(scriptPubKey);

    if (signatures.length < scriptData.m) {
      throw new TypeError('Not enough signatures provided');
    }

    if (signatures.length > scriptData.pubKeys.length) {
      throw new TypeError('Too many signatures provided');
    }
  }

  return [].concat(EMPTY_BUFFER, signatures.map(function (sig) {
    if (sig === OPS.OP_0) {
      return EMPTY_BUFFER;
    }
    return sig;
  }));
}

function encode(signatures, scriptPubKey) {
  return bscript.compile(encodeStack(signatures, scriptPubKey));
}

function decodeStack(stack, allowIncomplete) {
  typeforce(typeforce.Array, stack);
  typeforce(check, stack, allowIncomplete);
  return stack.slice(1);
}

function decode(buffer, allowIncomplete) {
  var stack = bscript.decompile(buffer);
  return decodeStack(stack, allowIncomplete);
}

module.exports = {
  check: check,
  decode: decode,
  decodeStack: decodeStack,
  encode: encode,
  encodeStack: encodeStack
};

},{"../../script":53,"./output":58,"bitcoin-ops":41,"safe-buffer":591,"typeforce":605}],58:[function(require,module,exports){
'use strict';

// m [pubKeys ...] n OP_CHECKMULTISIG

var bscript = require('../../script');
var types = require('../../types');
var typeforce = require('typeforce');
var OPS = require('bitcoin-ops');
var OP_INT_BASE = OPS.OP_RESERVED; // OP_1 - 1

function check(script, allowIncomplete) {
  var chunks = bscript.decompile(script);

  if (chunks.length < 4) return false;
  if (chunks[chunks.length - 1] !== OPS.OP_CHECKMULTISIG) return false;
  if (!types.Number(chunks[0])) return false;
  if (!types.Number(chunks[chunks.length - 2])) return false;
  var m = chunks[0] - OP_INT_BASE;
  var n = chunks[chunks.length - 2] - OP_INT_BASE;

  if (m <= 0) return false;
  if (n > 16) return false;
  if (m > n) return false;
  if (n !== chunks.length - 3) return false;
  if (allowIncomplete) return true;

  var keys = chunks.slice(1, -2);
  return keys.every(bscript.isCanonicalPubKey);
}
check.toJSON = function () {
  return 'multi-sig output';
};

function encode(m, pubKeys) {
  typeforce({
    m: types.Number,
    pubKeys: [bscript.isCanonicalPubKey]
  }, {
    m: m,
    pubKeys: pubKeys
  });

  var n = pubKeys.length;
  if (n < m) throw new TypeError('Not enough pubKeys provided');

  return bscript.compile([].concat(OP_INT_BASE + m, pubKeys, OP_INT_BASE + n, OPS.OP_CHECKMULTISIG));
}

function decode(buffer, allowIncomplete) {
  var chunks = bscript.decompile(buffer);
  typeforce(check, chunks, allowIncomplete);

  return {
    m: chunks[0] - OP_INT_BASE,
    pubKeys: chunks.slice(1, -2)
  };
}

module.exports = {
  check: check,
  decode: decode,
  encode: encode
};

},{"../../script":53,"../../types":79,"bitcoin-ops":41,"typeforce":605}],59:[function(require,module,exports){
'use strict';

// OP_RETURN {data}

var bscript = require('../script');
var types = require('../types');
var typeforce = require('typeforce');
var OPS = require('bitcoin-ops');

function check(script) {
  return script.length === 2 && script[0] === OPS.OP_RETURN;
}
check.toJSON = function () {
  return 'null data output';
};

function encode(data) {
  typeforce(types.Buffer, data);

  return bscript.compile([OPS.OP_RETURN, data]);
}

function decode(buffer) {
  var script = bscript.decompile(buffer);
  typeforce(check, script);

  return script[1];
}

module.exports = {
  output: {
    check: check,
    decode: decode,
    encode: encode
  }
};

},{"../script":53,"../types":79,"bitcoin-ops":41,"typeforce":605}],60:[function(require,module,exports){
arguments[4][56][0].apply(exports,arguments)
},{"./input":61,"./output":62,"dup":56}],61:[function(require,module,exports){
'use strict';

// {signature}

var bscript = require('../../script');
var typeforce = require('typeforce');

function check(script) {
  var chunks = bscript.decompile(script);

  return chunks.length === 1 && bscript.isCanonicalSignature(chunks[0]);
}
check.toJSON = function () {
  return 'pubKey input';
};

function encodeStack(signature) {
  typeforce(bscript.isCanonicalSignature, signature);
  return [signature];
}

function encode(signature) {
  return bscript.compile(encodeStack(signature));
}

function decodeStack(stack) {
  typeforce(typeforce.Array, stack);
  typeforce(check, stack);
  return stack[0];
}

function decode(buffer) {
  var stack = bscript.decompile(buffer);
  return decodeStack(stack);
}

module.exports = {
  check: check,
  decode: decode,
  decodeStack: decodeStack,
  encode: encode,
  encodeStack: encodeStack
};

},{"../../script":53,"typeforce":605}],62:[function(require,module,exports){
'use strict';

// {pubKey} OP_CHECKSIG

var bscript = require('../../script');
var typeforce = require('typeforce');
var OPS = require('bitcoin-ops');

function check(script) {
  var chunks = bscript.decompile(script);

  return chunks.length === 2 && bscript.isCanonicalPubKey(chunks[0]) && chunks[1] === OPS.OP_CHECKSIG;
}
check.toJSON = function () {
  return 'pubKey output';
};

function encode(pubKey) {
  typeforce(bscript.isCanonicalPubKey, pubKey);

  return bscript.compile([pubKey, OPS.OP_CHECKSIG]);
}

function decode(buffer) {
  var chunks = bscript.decompile(buffer);
  typeforce(check, chunks);

  return chunks[0];
}

module.exports = {
  check: check,
  decode: decode,
  encode: encode
};

},{"../../script":53,"bitcoin-ops":41,"typeforce":605}],63:[function(require,module,exports){
arguments[4][56][0].apply(exports,arguments)
},{"./input":64,"./output":65,"dup":56}],64:[function(require,module,exports){
'use strict';

// {signature} {pubKey}

var bscript = require('../../script');
var typeforce = require('typeforce');

function check(script) {
  var chunks = bscript.decompile(script);

  return chunks.length === 2 && bscript.isCanonicalSignature(chunks[0]) && bscript.isCanonicalPubKey(chunks[1]);
}
check.toJSON = function () {
  return 'pubKeyHash input';
};

function encodeStack(signature, pubKey) {
  typeforce({
    signature: bscript.isCanonicalSignature,
    pubKey: bscript.isCanonicalPubKey
  }, {
    signature: signature,
    pubKey: pubKey
  });

  return [signature, pubKey];
}

function encode(signature, pubKey) {
  return bscript.compile(encodeStack(signature, pubKey));
}

function decodeStack(stack) {
  typeforce(typeforce.Array, stack);
  typeforce(check, stack);

  return {
    signature: stack[0],
    pubKey: stack[1]
  };
}

function decode(buffer) {
  var stack = bscript.decompile(buffer);
  return decodeStack(stack);
}

module.exports = {
  check: check,
  decode: decode,
  decodeStack: decodeStack,
  encode: encode,
  encodeStack: encodeStack
};

},{"../../script":53,"typeforce":605}],65:[function(require,module,exports){
'use strict';

// OP_DUP OP_HASH160 {pubKeyHash} OP_EQUALVERIFY OP_CHECKSIG

var bscript = require('../../script');
var types = require('../../types');
var typeforce = require('typeforce');
var OPS = require('bitcoin-ops');

function check(script) {
  var buffer = bscript.compile(script);

  return buffer.length === 25 && buffer[0] === OPS.OP_DUP && buffer[1] === OPS.OP_HASH160 && buffer[2] === 0x14 && buffer[23] === OPS.OP_EQUALVERIFY && buffer[24] === OPS.OP_CHECKSIG;
}
check.toJSON = function () {
  return 'pubKeyHash output';
};

function encode(pubKeyHash) {
  typeforce(types.Hash160bit, pubKeyHash);

  return bscript.compile([OPS.OP_DUP, OPS.OP_HASH160, pubKeyHash, OPS.OP_EQUALVERIFY, OPS.OP_CHECKSIG]);
}

function decode(buffer) {
  typeforce(check, buffer);

  return buffer.slice(3, 23);
}

module.exports = {
  check: check,
  decode: decode,
  encode: encode
};

},{"../../script":53,"../../types":79,"bitcoin-ops":41,"typeforce":605}],66:[function(require,module,exports){
arguments[4][56][0].apply(exports,arguments)
},{"./input":67,"./output":68,"dup":56}],67:[function(require,module,exports){
'use strict';

// <scriptSig> {serialized scriptPubKey script}

var Buffer = require('safe-buffer').Buffer;
var bscript = require('../../script');
var typeforce = require('typeforce');

var p2ms = require('../multisig/');
var p2pk = require('../pubkey/');
var p2pkh = require('../pubkeyhash/');
var p2wpkho = require('../witnesspubkeyhash/output');
var p2wsho = require('../witnessscripthash/output');

function check(script, allowIncomplete) {
  var chunks = bscript.decompile(script);
  if (chunks.length < 1) return false;

  var lastChunk = chunks[chunks.length - 1];
  if (!Buffer.isBuffer(lastChunk)) return false;

  var scriptSigChunks = bscript.decompile(bscript.compile(chunks.slice(0, -1)));
  var redeemScriptChunks = bscript.decompile(lastChunk);

  // is redeemScript a valid script?
  if (redeemScriptChunks.length === 0) return false;

  // is redeemScriptSig push only?
  if (!bscript.isPushOnly(scriptSigChunks)) return false;

  // is witness?
  if (chunks.length === 1) {
    return p2wsho.check(redeemScriptChunks) || p2wpkho.check(redeemScriptChunks);
  }

  // match types
  if (p2pkh.input.check(scriptSigChunks) && p2pkh.output.check(redeemScriptChunks)) return true;

  if (p2ms.input.check(scriptSigChunks, allowIncomplete) && p2ms.output.check(redeemScriptChunks)) return true;

  if (p2pk.input.check(scriptSigChunks) && p2pk.output.check(redeemScriptChunks)) return true;

  return false;
}
check.toJSON = function () {
  return 'scriptHash input';
};

function encodeStack(redeemScriptStack, redeemScript) {
  var serializedScriptPubKey = bscript.compile(redeemScript);

  return [].concat(redeemScriptStack, serializedScriptPubKey);
}

function encode(redeemScriptSig, redeemScript) {
  var redeemScriptStack = bscript.decompile(redeemScriptSig);

  return bscript.compile(encodeStack(redeemScriptStack, redeemScript));
}

function decodeStack(stack) {
  typeforce(typeforce.Array, stack);
  typeforce(check, stack);

  return {
    redeemScriptStack: stack.slice(0, -1),
    redeemScript: stack[stack.length - 1]
  };
}

function decode(buffer) {
  var stack = bscript.decompile(buffer);
  var result = decodeStack(stack);
  result.redeemScriptSig = bscript.compile(result.redeemScriptStack);
  delete result.redeemScriptStack;
  return result;
}

module.exports = {
  check: check,
  decode: decode,
  decodeStack: decodeStack,
  encode: encode,
  encodeStack: encodeStack
};

},{"../../script":53,"../multisig/":56,"../pubkey/":60,"../pubkeyhash/":63,"../witnesspubkeyhash/output":73,"../witnessscripthash/output":76,"safe-buffer":591,"typeforce":605}],68:[function(require,module,exports){
'use strict';

// OP_HASH160 {scriptHash} OP_EQUAL

var bscript = require('../../script');
var types = require('../../types');
var typeforce = require('typeforce');
var OPS = require('bitcoin-ops');

function check(script) {
  var buffer = bscript.compile(script);

  return buffer.length === 23 && buffer[0] === OPS.OP_HASH160 && buffer[1] === 0x14 && buffer[22] === OPS.OP_EQUAL;
}
check.toJSON = function () {
  return 'scriptHash output';
};

function encode(scriptHash) {
  typeforce(types.Hash160bit, scriptHash);

  return bscript.compile([OPS.OP_HASH160, scriptHash, OPS.OP_EQUAL]);
}

function decode(buffer) {
  typeforce(check, buffer);

  return buffer.slice(2, 22);
}

module.exports = {
  check: check,
  decode: decode,
  encode: encode
};

},{"../../script":53,"../../types":79,"bitcoin-ops":41,"typeforce":605}],69:[function(require,module,exports){
'use strict';

module.exports = {
  output: require('./output')
};

},{"./output":70}],70:[function(require,module,exports){
'use strict';

// OP_RETURN {aa21a9ed} {commitment}

var Buffer = require('safe-buffer').Buffer;
var bscript = require('../../script');
var types = require('../../types');
var typeforce = require('typeforce');
var OPS = require('bitcoin-ops');

var HEADER = Buffer.from('aa21a9ed', 'hex');

function check(script) {
  var buffer = bscript.compile(script);

  return buffer.length > 37 && buffer[0] === OPS.OP_RETURN && buffer[1] === 0x24 && buffer.slice(2, 6).equals(HEADER);
}

check.toJSON = function () {
  return 'Witness commitment output';
};

function encode(commitment) {
  typeforce(types.Hash256bit, commitment);

  var buffer = Buffer.allocUnsafe(36);
  HEADER.copy(buffer, 0);
  commitment.copy(buffer, 4);

  return bscript.compile([OPS.OP_RETURN, buffer]);
}

function decode(buffer) {
  typeforce(check, buffer);

  return bscript.decompile(buffer)[1].slice(4, 36);
}

module.exports = {
  check: check,
  decode: decode,
  encode: encode
};

},{"../../script":53,"../../types":79,"bitcoin-ops":41,"safe-buffer":591,"typeforce":605}],71:[function(require,module,exports){
arguments[4][56][0].apply(exports,arguments)
},{"./input":72,"./output":73,"dup":56}],72:[function(require,module,exports){
'use strict';

// {signature} {pubKey}

var bscript = require('../../script');
var typeforce = require('typeforce');

function isCompressedCanonicalPubKey(pubKey) {
  return bscript.isCanonicalPubKey(pubKey) && pubKey.length === 33;
}

function check(script) {
  var chunks = bscript.decompile(script);

  return chunks.length === 2 && bscript.isCanonicalSignature(chunks[0]) && isCompressedCanonicalPubKey(chunks[1]);
}
check.toJSON = function () {
  return 'witnessPubKeyHash input';
};

function encodeStack(signature, pubKey) {
  typeforce({
    signature: bscript.isCanonicalSignature,
    pubKey: isCompressedCanonicalPubKey
  }, {
    signature: signature,
    pubKey: pubKey
  });

  return [signature, pubKey];
}

function decodeStack(stack) {
  typeforce(typeforce.Array, stack);
  typeforce(check, stack);

  return {
    signature: stack[0],
    pubKey: stack[1]
  };
}

module.exports = {
  check: check,
  decodeStack: decodeStack,
  encodeStack: encodeStack
};

},{"../../script":53,"typeforce":605}],73:[function(require,module,exports){
'use strict';

// OP_0 {pubKeyHash}

var bscript = require('../../script');
var types = require('../../types');
var typeforce = require('typeforce');
var OPS = require('bitcoin-ops');

function check(script) {
  var buffer = bscript.compile(script);

  return buffer.length === 22 && buffer[0] === OPS.OP_0 && buffer[1] === 0x14;
}
check.toJSON = function () {
  return 'Witness pubKeyHash output';
};

function encode(pubKeyHash) {
  typeforce(types.Hash160bit, pubKeyHash);

  return bscript.compile([OPS.OP_0, pubKeyHash]);
}

function decode(buffer) {
  typeforce(check, buffer);

  return buffer.slice(2);
}

module.exports = {
  check: check,
  decode: decode,
  encode: encode
};

},{"../../script":53,"../../types":79,"bitcoin-ops":41,"typeforce":605}],74:[function(require,module,exports){
arguments[4][56][0].apply(exports,arguments)
},{"./input":75,"./output":76,"dup":56}],75:[function(require,module,exports){
(function (Buffer){
'use strict';

// <scriptSig> {serialized scriptPubKey script}

var bscript = require('../../script');
var types = require('../../types');
var typeforce = require('typeforce');

var p2ms = require('../multisig/');
var p2pk = require('../pubkey/');
var p2pkh = require('../pubkeyhash/');

function check(chunks, allowIncomplete) {
  typeforce(types.Array, chunks);
  if (chunks.length < 1) return false;

  var witnessScript = chunks[chunks.length - 1];
  if (!Buffer.isBuffer(witnessScript)) return false;

  var witnessScriptChunks = bscript.decompile(witnessScript);

  // is witnessScript a valid script?
  if (witnessScriptChunks.length === 0) return false;

  var witnessRawScriptSig = bscript.compile(chunks.slice(0, -1));

  // match types
  if (p2pkh.input.check(witnessRawScriptSig) && p2pkh.output.check(witnessScriptChunks)) return true;

  if (p2ms.input.check(witnessRawScriptSig, allowIncomplete) && p2ms.output.check(witnessScriptChunks)) return true;

  if (p2pk.input.check(witnessRawScriptSig) && p2pk.output.check(witnessScriptChunks)) return true;

  return false;
}
check.toJSON = function () {
  return 'witnessScriptHash input';
};

function encodeStack(witnessData, witnessScript) {
  typeforce({
    witnessData: [types.Buffer],
    witnessScript: types.Buffer
  }, {
    witnessData: witnessData,
    witnessScript: witnessScript
  });

  return [].concat(witnessData, witnessScript);
}

function decodeStack(stack) {
  typeforce(typeforce.Array, stack);
  typeforce(check, stack);
  return {
    witnessData: stack.slice(0, -1),
    witnessScript: stack[stack.length - 1]
  };
}

module.exports = {
  check: check,
  decodeStack: decodeStack,
  encodeStack: encodeStack
};

}).call(this,{"isBuffer":require("../../../../is-buffer/index.js")})
},{"../../../../is-buffer/index.js":566,"../../script":53,"../../types":79,"../multisig/":56,"../pubkey/":60,"../pubkeyhash/":63,"typeforce":605}],76:[function(require,module,exports){
'use strict';

// OP_0 {scriptHash}

var bscript = require('../../script');
var types = require('../../types');
var typeforce = require('typeforce');
var OPS = require('bitcoin-ops');

function check(script) {
  var buffer = bscript.compile(script);

  return buffer.length === 34 && buffer[0] === OPS.OP_0 && buffer[1] === 0x20;
}
check.toJSON = function () {
  return 'Witness scriptHash output';
};

function encode(scriptHash) {
  typeforce(types.Hash256bit, scriptHash);

  return bscript.compile([OPS.OP_0, scriptHash]);
}

function decode(buffer) {
  typeforce(check, buffer);

  return buffer.slice(2);
}

module.exports = {
  check: check,
  decode: decode,
  encode: encode
};

},{"../../script":53,"../../types":79,"bitcoin-ops":41,"typeforce":605}],77:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var bcrypto = require('./crypto');
var bscript = require('./script');
var bufferutils = require('./bufferutils');
var opcodes = require('bitcoin-ops');
var typeforce = require('typeforce');
var types = require('./types');
var varuint = require('varuint-bitcoin');

function varSliceSize(someScript) {
  var length = someScript.length;

  return varuint.encodingLength(length) + length;
}

function vectorSize(someVector) {
  var length = someVector.length;

  return varuint.encodingLength(length) + someVector.reduce(function (sum, witness) {
    return sum + varSliceSize(witness);
  }, 0);
}

function Transaction() {
  this.version = 1;
  this.locktime = 0;
  this.ins = [];
  this.outs = [];
  this.joinsplits = [];
}

Transaction.DEFAULT_SEQUENCE = 0xffffffff;
Transaction.SIGHASH_ALL = 0x01;
Transaction.SIGHASH_NONE = 0x02;
Transaction.SIGHASH_SINGLE = 0x03;
Transaction.SIGHASH_ANYONECANPAY = 0x80;
Transaction.ADVANCED_TRANSACTION_MARKER = 0x00;
Transaction.ADVANCED_TRANSACTION_FLAG = 0x01;

var EMPTY_SCRIPT = Buffer.allocUnsafe(0);
var EMPTY_WITNESS = [];
var ZERO = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
var ONE = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
var VALUE_UINT64_MAX = Buffer.from('ffffffffffffffff', 'hex');
var BLANK_OUTPUT = {
  script: EMPTY_SCRIPT,
  valueBuffer: VALUE_UINT64_MAX
};

Transaction.ZCASH_NUM_JS_INPUTS = 2;
Transaction.ZCASH_NUM_JS_OUTPUTS = 2;
Transaction.ZCASH_NOTECIPHERTEXT_SIZE = 1 + 8 + 32 + 32 + 512 + 16;

Transaction.ZCASH_G1_PREFIX_MASK = 0x02;
Transaction.ZCASH_G2_PREFIX_MASK = 0x0a;

Transaction.fromBuffer = function (buffer, zcash, __noStrict) {
  var offset = 0;
  function readSlice(n) {
    offset += n;
    return buffer.slice(offset - n, offset);
  }

  function readUInt8() {
    var i = buffer.readUInt8(offset);
    offset += 1;
    return i;
  }

  function readUInt32() {
    var i = buffer.readUInt32LE(offset);
    offset += 4;
    return i;
  }

  function readInt32() {
    var i = buffer.readInt32LE(offset);
    offset += 4;
    return i;
  }

  function readUInt64() {
    var i = bufferutils.readUInt64LE(buffer, offset);
    offset += 8;
    return i;
  }

  function readVarInt() {
    var vi = varuint.decode(buffer, offset);
    offset += varuint.decode.bytes;
    return vi;
  }

  function readVarSlice() {
    return readSlice(readVarInt());
  }

  function readVector() {
    var count = readVarInt();
    var vector = [];
    for (var i = 0; i < count; i++) {
      vector.push(readVarSlice());
    }return vector;
  }

  function readCompressedG1() {
    var yLsb = readUInt8() & 1;
    var x = readSlice(32);
    return {
      x: x,
      yLsb: yLsb
    };
  }

  function readCompressedG2() {
    var yLsb = readUInt8() & 1;
    var x = readSlice(64);
    return {
      x: x,
      yLsb: yLsb
    };
  }

  var tx = new Transaction();

  if (zcash) {
    var header = readUInt32();
    tx.version = header & 0x7ffffff;
    var overwintered = header >>> 31;
    if (tx.version >= 3) {
      if (!overwintered) {
        throw new Error("zcash tx v3+ not overwintered");
      }
      tx.versionGroupId = readUInt32();
    }
  } else {
    tx.version = readInt32();
  }

  var marker = buffer.readUInt8(offset);
  var flag = buffer.readUInt8(offset + 1);

  var hasWitnesses = false;
  if (!zcash) {
    if (marker === Transaction.ADVANCED_TRANSACTION_MARKER && flag === Transaction.ADVANCED_TRANSACTION_FLAG) {
      offset += 2;
      hasWitnesses = true;
    }
  }

  var vinLen = readVarInt();
  for (var i = 0; i < vinLen; ++i) {
    tx.ins.push({
      hash: readSlice(32),
      index: readUInt32(),
      script: readVarSlice(),
      sequence: readUInt32(),
      witness: EMPTY_WITNESS
    });
  }

  var voutLen = readVarInt();
  for (i = 0; i < voutLen; ++i) {
    tx.outs.push({
      value: readUInt64(),
      script: readVarSlice()
    });
  }

  if (hasWitnesses) {
    for (i = 0; i < vinLen; ++i) {
      tx.ins[i].witness = readVector();
    }

    // was this pointless?
    if (!tx.hasWitnesses()) throw new Error('Transaction has superfluous witness data');
  }

  tx.locktime = readUInt32();

  if (tx.version >= 3 && zcash) {
    tx.expiry = readUInt32();
  }

  if (tx.version >= 2 && zcash) {
    var jsLen = readVarInt();
    for (i = 0; i < jsLen; ++i) {
      var vpubOld = readUInt64();
      var vpubNew = readUInt64();
      var anchor = readSlice(32);
      var nullifiers = [];
      for (var j = 0; j < Transaction.ZCASH_NUM_JS_INPUTS; j++) {
        nullifiers.push(readSlice(32));
      }
      var commitments = [];
      for (j = 0; j < Transaction.ZCASH_NUM_JS_OUTPUTS; j++) {
        commitments.push(readSlice(32));
      }
      var ephemeralKey = readSlice(32);
      var randomSeed = readSlice(32);
      var macs = [];
      for (j = 0; j < Transaction.ZCASH_NUM_JS_INPUTS; j++) {
        macs.push(readSlice(32));
      }
      // TODO what are those exactly? Can it be expressed by BigNum?
      var zproof = {
        gA: readCompressedG1(),
        gAPrime: readCompressedG1(),
        gB: readCompressedG2(),
        gBPrime: readCompressedG1(),
        gC: readCompressedG1(),
        gCPrime: readCompressedG1(),
        gK: readCompressedG1(),
        gH: readCompressedG1()
      };
      var ciphertexts = [];
      for (j = 0; j < Transaction.ZCASH_NUM_JS_OUTPUTS; j++) {
        ciphertexts.push(readSlice(Transaction.ZCASH_NOTECIPHERTEXT_SIZE));
      }

      tx.joinsplits.push({
        vpubOld: vpubOld,
        vpubNew: vpubNew,
        anchor: anchor,
        nullifiers: nullifiers,
        commitments: commitments,
        ephemeralKey: ephemeralKey,
        randomSeed: randomSeed,
        macs: macs,
        zproof: zproof,
        ciphertexts: ciphertexts
      });
    }
    if (jsLen > 0) {
      tx.joinsplitPubkey = readSlice(32);
      tx.joinsplitSig = readSlice(64);
    }
  }

  tx.zcash = !!zcash;

  if (__noStrict) return tx;
  if (offset !== buffer.length) throw new Error('Transaction has unexpected data');

  return tx;
};

Transaction.fromHex = function (hex, zcash) {
  return Transaction.fromBuffer(new Buffer(hex, 'hex'), zcash);
};

Transaction.isCoinbaseHash = function (buffer) {
  typeforce(types.Hash256bit, buffer);
  for (var i = 0; i < 32; ++i) {
    if (buffer[i] !== 0) return false;
  }
  return true;
};

Transaction.prototype.isCoinbase = function () {
  return this.ins.length === 1 && Transaction.isCoinbaseHash(this.ins[0].hash);
};

Transaction.prototype.addInput = function (hash, index, sequence, scriptSig) {
  typeforce(types.tuple(types.Hash256bit, types.UInt32, types.maybe(types.UInt32), types.maybe(types.Buffer)), arguments);

  if (types.Null(sequence)) {
    sequence = Transaction.DEFAULT_SEQUENCE;
  }

  // Add the input and return the input's index
  return this.ins.push({
    hash: hash,
    index: index,
    script: scriptSig || EMPTY_SCRIPT,
    sequence: sequence,
    witness: EMPTY_WITNESS
  }) - 1;
};

Transaction.prototype.addOutput = function (scriptPubKey, value) {
  typeforce(types.tuple(types.Buffer, types.Satoshi), arguments);

  // Add the output and return the output's index
  return this.outs.push({
    script: scriptPubKey,
    value: value
  }) - 1;
};

Transaction.prototype.hasWitnesses = function () {
  return this.ins.some(function (x) {
    return x.witness.length !== 0;
  });
};

Transaction.prototype.weight = function () {
  var base = this.__byteLength(false);
  var total = this.__byteLength(true);
  return base * 3 + total;
};

Transaction.prototype.virtualSize = function () {
  return Math.ceil(this.weight() / 4);
};

Transaction.prototype.byteLength = function () {
  return this.__byteLength(true);
};

Transaction.prototype.joinsplitByteLength = function () {
  if (this.version < 2) {
    return 0;
  }

  if (!this.zcash) {
    return 0;
  }

  var pubkeySigLength = this.joinsplits.length > 0 ? 32 + 64 : 0;
  return bufferutils.varIntSize(this.joinsplits.length) + this.joinsplits.reduce(function (sum, joinsplit) {
    return sum + 8 + 8 + 32 + joinsplit.nullifiers.length * 32 + joinsplit.commitments.length * 32 + 32 + 32 + joinsplit.macs.length * 32 + 65 + 33 * 7 + joinsplit.ciphertexts.length * Transaction.ZCASH_NOTECIPHERTEXT_SIZE;
  }, 0) + pubkeySigLength;
};

Transaction.prototype.__byteLength = function (__allowWitness) {
  var hasWitnesses = __allowWitness && this.hasWitnesses();

  return (hasWitnesses ? 10 : 8) + varuint.encodingLength(this.ins.length) + varuint.encodingLength(this.outs.length) + this.ins.reduce(function (sum, input) {
    return sum + 40 + varSliceSize(input.script);
  }, 0) + this.outs.reduce(function (sum, output) {
    return sum + 8 + varSliceSize(output.script);
  }, 0) + (hasWitnesses ? this.ins.reduce(function (sum, input) {
    return sum + vectorSize(input.witness);
  }, 0) : 0) + this.joinsplitByteLength() + (this.versionGroupId == null ? 0 : 4) + (this.expiry == null ? 0 : 4);
};

Transaction.prototype.clone = function () {
  var newTx = new Transaction();
  newTx.version = this.version;
  newTx.locktime = this.locktime;
  newTx.zcash = this.zcash;

  newTx.ins = this.ins.map(function (txIn) {
    return {
      hash: txIn.hash,
      index: txIn.index,
      script: txIn.script,
      sequence: txIn.sequence,
      witness: txIn.witness
    };
  });

  newTx.outs = this.outs.map(function (txOut) {
    return {
      script: txOut.script,
      value: txOut.value
    };
  });

  return newTx;
};

/**
 * Hash transaction for signing a specific input.
 *
 * Bitcoin uses a different hash for each signed transaction input.
 * This method copies the transaction, makes the necessary changes based on the
 * hashType, and then hashes the result.
 * This hash can then be used to sign the provided transaction input.
 */
Transaction.prototype.hashForSignature = function (inIndex, prevOutScript, hashType) {
  typeforce(types.tuple(types.UInt32, types.Buffer, /* types.UInt8 */types.Number), arguments);

  // https://github.com/bitcoin/bitcoin/blob/master/src/test/sighash_tests.cpp#L29
  if (inIndex >= this.ins.length) return ONE;

  // ignore OP_CODESEPARATOR
  var ourScript = bscript.compile(bscript.decompile(prevOutScript).filter(function (x) {
    return x !== opcodes.OP_CODESEPARATOR;
  }));

  var txTmp = this.clone();

  // SIGHASH_NONE: ignore all outputs? (wildcard payee)
  if ((hashType & 0x1f) === Transaction.SIGHASH_NONE) {
    txTmp.outs = [];

    // ignore sequence numbers (except at inIndex)
    txTmp.ins.forEach(function (input, i) {
      if (i === inIndex) return;

      input.sequence = 0;
    });

    // SIGHASH_SINGLE: ignore all outputs, except at the same index?
  } else if ((hashType & 0x1f) === Transaction.SIGHASH_SINGLE) {
    // https://github.com/bitcoin/bitcoin/blob/master/src/test/sighash_tests.cpp#L60
    if (inIndex >= this.outs.length) return ONE;

    // truncate outputs after
    txTmp.outs.length = inIndex + 1;

    // "blank" outputs before
    for (var i = 0; i < inIndex; i++) {
      txTmp.outs[i] = BLANK_OUTPUT;
    }

    // ignore sequence numbers (except at inIndex)
    txTmp.ins.forEach(function (input, y) {
      if (y === inIndex) return;

      input.sequence = 0;
    });
  }

  // SIGHASH_ANYONECANPAY: ignore inputs entirely?
  if (hashType & Transaction.SIGHASH_ANYONECANPAY) {
    txTmp.ins = [txTmp.ins[inIndex]];
    txTmp.ins[0].script = ourScript;

    // SIGHASH_ALL: only ignore input scripts
  } else {
    // "blank" others input scripts
    txTmp.ins.forEach(function (input) {
      input.script = EMPTY_SCRIPT;
    });
    txTmp.ins[inIndex].script = ourScript;
  }

  // serialize and hash
  var buffer = Buffer.allocUnsafe(txTmp.__byteLength(false) + 4);
  buffer.writeInt32LE(hashType, buffer.length - 4);
  txTmp.__toBuffer(buffer, 0, false);

  return bcrypto.hash256(buffer);
};

Transaction.prototype.hashForWitnessV0 = function (inIndex, prevOutScript, value, hashType) {
  typeforce(types.tuple(types.UInt32, types.Buffer, types.Satoshi, types.UInt32), arguments);

  var tbuffer, toffset;
  function writeSlice(slice) {
    toffset += slice.copy(tbuffer, toffset);
  }
  function writeUInt32(i) {
    toffset = tbuffer.writeUInt32LE(i, toffset);
  }
  function writeUInt64(i) {
    toffset = bufferutils.writeUInt64LE(tbuffer, i, toffset);
  }
  function writeVarInt(i) {
    varuint.encode(i, tbuffer, toffset);
    toffset += varuint.encode.bytes;
  }
  function writeVarSlice(slice) {
    writeVarInt(slice.length);writeSlice(slice);
  }

  var hashOutputs = ZERO;
  var hashPrevouts = ZERO;
  var hashSequence = ZERO;

  if (!(hashType & Transaction.SIGHASH_ANYONECANPAY)) {
    tbuffer = Buffer.allocUnsafe(36 * this.ins.length);
    toffset = 0;

    this.ins.forEach(function (txIn) {
      writeSlice(txIn.hash);
      writeUInt32(txIn.index);
    });

    hashPrevouts = bcrypto.hash256(tbuffer);
  }

  if (!(hashType & Transaction.SIGHASH_ANYONECANPAY) && (hashType & 0x1f) !== Transaction.SIGHASH_SINGLE && (hashType & 0x1f) !== Transaction.SIGHASH_NONE) {
    tbuffer = Buffer.allocUnsafe(4 * this.ins.length);
    toffset = 0;

    this.ins.forEach(function (txIn) {
      writeUInt32(txIn.sequence);
    });

    hashSequence = bcrypto.hash256(tbuffer);
  }

  if ((hashType & 0x1f) !== Transaction.SIGHASH_SINGLE && (hashType & 0x1f) !== Transaction.SIGHASH_NONE) {
    var txOutsSize = this.outs.reduce(function (sum, output) {
      return sum + 8 + varSliceSize(output.script);
    }, 0);

    tbuffer = Buffer.allocUnsafe(txOutsSize);
    toffset = 0;

    this.outs.forEach(function (out) {
      writeUInt64(out.value);
      writeVarSlice(out.script);
    });

    hashOutputs = bcrypto.hash256(tbuffer);
  } else if ((hashType & 0x1f) === Transaction.SIGHASH_SINGLE && inIndex < this.outs.length) {
    var output = this.outs[inIndex];

    tbuffer = Buffer.allocUnsafe(8 + varSliceSize(output.script));
    toffset = 0;
    writeUInt64(output.value);
    writeVarSlice(output.script);

    hashOutputs = bcrypto.hash256(tbuffer);
  }

  tbuffer = Buffer.allocUnsafe(156 + varSliceSize(prevOutScript));
  toffset = 0;

  var input = this.ins[inIndex];
  writeUInt32(this.version);
  writeSlice(hashPrevouts);
  writeSlice(hashSequence);
  writeSlice(input.hash);
  writeUInt32(input.index);
  writeVarSlice(prevOutScript);
  writeUInt64(value);
  writeUInt32(input.sequence);
  writeSlice(hashOutputs);
  writeUInt32(this.locktime);
  writeUInt32(hashType);
  return bcrypto.hash256(tbuffer);
};

Transaction.prototype.getHash = function () {
  return bcrypto.hash256(this.__toBuffer(undefined, undefined, false));
};

Transaction.prototype.getId = function () {
  // transaction hash's are displayed in reverse order
  return this.getHash().reverse().toString('hex');
};

Transaction.prototype.toBuffer = function (buffer, initialOffset) {
  return this.__toBuffer(buffer, initialOffset, true);
};

Transaction.prototype.__toBuffer = function (buffer, initialOffset, __allowWitness) {
  if (!buffer) buffer = Buffer.allocUnsafe(this.__byteLength(__allowWitness));

  var offset = initialOffset || 0;
  function writeSlice(slice) {
    offset += slice.copy(buffer, offset);
  }
  function writeUInt8(i) {
    offset = buffer.writeUInt8(i, offset);
  }
  function writeUInt32(i) {
    offset = buffer.writeUInt32LE(i, offset);
  }
  function writeInt32(i) {
    offset = buffer.writeInt32LE(i, offset);
  }
  function writeUInt64(i) {
    offset = bufferutils.writeUInt64LE(buffer, i, offset);
  }
  function writeVarInt(i) {
    varuint.encode(i, buffer, offset);
    offset += varuint.encode.bytes;
  }
  function writeVarSlice(slice) {
    writeVarInt(slice.length);writeSlice(slice);
  }
  function writeVector(vector) {
    writeVarInt(vector.length);vector.forEach(writeVarSlice);
  }

  function writeCompressedG1(i) {
    writeUInt8(Transaction.ZCASH_G1_PREFIX_MASK | i.yLsb);
    writeSlice(i.x);
  }

  function writeCompressedG2(i) {
    writeUInt8(Transaction.ZCASH_G2_PREFIX_MASK | i.yLsb);
    writeSlice(i.x);
  }

  if (this.versionGroupId != null) {
    writeInt32(this.version | 1 << 31);
    writeUInt32(this.versionGroupId);
  } else {
    writeInt32(this.version);
  }

  var hasWitnesses = __allowWitness && this.hasWitnesses();

  if (hasWitnesses) {
    writeUInt8(Transaction.ADVANCED_TRANSACTION_MARKER);
    writeUInt8(Transaction.ADVANCED_TRANSACTION_FLAG);
  }

  writeVarInt(this.ins.length);

  this.ins.forEach(function (txIn) {
    writeSlice(txIn.hash);
    writeUInt32(txIn.index);
    writeVarSlice(txIn.script);
    writeUInt32(txIn.sequence);
  });

  writeVarInt(this.outs.length);
  this.outs.forEach(function (txOut) {
    if (!txOut.valueBuffer) {
      writeUInt64(txOut.value);
    } else {
      writeSlice(txOut.valueBuffer);
    }

    writeVarSlice(txOut.script);
  });

  if (hasWitnesses) {
    this.ins.forEach(function (input) {
      writeVector(input.witness);
    });
  }

  writeUInt32(this.locktime);

  if (this.expiry != null) {
    writeUInt32(this.expiry);
  }

  if (this.version >= 2 && this.zcash) {
    writeVarInt(this.joinsplits.length);
    this.joinsplits.forEach(function (joinsplit) {
      writeUInt64(joinsplit.vpubOld);
      writeUInt64(joinsplit.vpubNew);
      writeSlice(joinsplit.anchor);
      joinsplit.nullifiers.forEach(function (nullifier) {
        writeSlice(nullifier);
      });
      joinsplit.commitments.forEach(function (nullifier) {
        writeSlice(nullifier);
      });
      writeSlice(joinsplit.ephemeralKey);
      writeSlice(joinsplit.randomSeed);
      joinsplit.macs.forEach(function (nullifier) {
        writeSlice(nullifier);
      });
      writeCompressedG1(joinsplit.zproof.gA);
      writeCompressedG1(joinsplit.zproof.gAPrime);
      writeCompressedG2(joinsplit.zproof.gB);
      writeCompressedG1(joinsplit.zproof.gBPrime);
      writeCompressedG1(joinsplit.zproof.gC);
      writeCompressedG1(joinsplit.zproof.gCPrime);
      writeCompressedG1(joinsplit.zproof.gK);
      writeCompressedG1(joinsplit.zproof.gH);
      joinsplit.ciphertexts.forEach(function (ciphertext) {
        writeSlice(ciphertext);
      });
    });
    if (this.joinsplits.length > 0) {
      writeSlice(this.joinsplitPubkey);
      writeSlice(this.joinsplitSig);
    }
  }

  // avoid slicing unless necessary
  if (initialOffset !== undefined) return buffer.slice(initialOffset, offset);
  return buffer;
};

Transaction.prototype.toHex = function () {
  return this.toBuffer().toString('hex');
};

Transaction.prototype.setInputScript = function (index, scriptSig) {
  typeforce(types.tuple(types.Number, types.Buffer), arguments);

  this.ins[index].script = scriptSig;
};

Transaction.prototype.setWitness = function (index, witness) {
  typeforce(types.tuple(types.Number, [types.Buffer]), arguments);

  this.ins[index].witness = witness;
};

module.exports = Transaction;

},{"./bufferutils":45,"./crypto":46,"./script":53,"./types":79,"bitcoin-ops":41,"safe-buffer":591,"typeforce":605,"varuint-bitcoin":611}],78:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var baddress = require('./address');
var bcrypto = require('./crypto');
var bscript = require('./script');
var btemplates = require('./templates');
var networks = require('./networks');
var ops = require('bitcoin-ops');
var typeforce = require('typeforce');
var types = require('./types');
var scriptTypes = btemplates.types;
var SIGNABLE = [btemplates.types.P2PKH, btemplates.types.P2PK, btemplates.types.MULTISIG];
var P2SH = SIGNABLE.concat([btemplates.types.P2WPKH, btemplates.types.P2WSH]);

var ECPair = require('./ecpair');
var ECSignature = require('./ecsignature');
var Transaction = require('./transaction');

function supportedType(type) {
  return SIGNABLE.indexOf(type) !== -1;
}

function supportedP2SHType(type) {
  return P2SH.indexOf(type) !== -1;
}

function extractChunks(type, chunks, script) {
  var pubKeys = [];
  var signatures = [];
  switch (type) {
    case scriptTypes.P2PKH:
      // if (redeemScript) throw new Error('Nonstandard... P2SH(P2PKH)')
      pubKeys = chunks.slice(1);
      signatures = chunks.slice(0, 1);
      break;

    case scriptTypes.P2PK:
      pubKeys[0] = script ? btemplates.pubKey.output.decode(script) : undefined;
      signatures = chunks.slice(0, 1);
      break;

    case scriptTypes.MULTISIG:
      if (script) {
        var multisig = btemplates.multisig.output.decode(script);
        pubKeys = multisig.pubKeys;
      }

      signatures = chunks.slice(1).map(function (chunk) {
        return chunk.length === 0 ? undefined : chunk;
      });
      break;
  }

  return {
    pubKeys: pubKeys,
    signatures: signatures
  };
}
function expandInput(scriptSig, witnessStack) {
  if (scriptSig.length === 0 && witnessStack.length === 0) return {};

  var prevOutScript;
  var prevOutType;
  var scriptType;
  var script;
  var redeemScript;
  var witnessScript;
  var witnessScriptType;
  var redeemScriptType;
  var witness = false;
  var p2wsh = false;
  var p2sh = false;
  var witnessProgram;
  var chunks;

  var scriptSigChunks = bscript.decompile(scriptSig);
  var sigType = btemplates.classifyInput(scriptSigChunks, true);
  if (sigType === scriptTypes.P2SH) {
    p2sh = true;
    redeemScript = scriptSigChunks[scriptSigChunks.length - 1];
    redeemScriptType = btemplates.classifyOutput(redeemScript);
    prevOutScript = btemplates.scriptHash.output.encode(bcrypto.hash160(redeemScript));
    prevOutType = scriptTypes.P2SH;
    script = redeemScript;
  }

  var classifyWitness = btemplates.classifyWitness(witnessStack, true);
  if (classifyWitness === scriptTypes.P2WSH) {
    witnessScript = witnessStack[witnessStack.length - 1];
    witnessScriptType = btemplates.classifyOutput(witnessScript);
    p2wsh = true;
    witness = true;
    if (scriptSig.length === 0) {
      prevOutScript = btemplates.witnessScriptHash.output.encode(bcrypto.sha256(witnessScript));
      prevOutType = scriptTypes.P2WSH;
      if (redeemScript !== undefined) {
        throw new Error('Redeem script given when unnecessary');
      }
      // bare witness
    } else {
      if (!redeemScript) {
        throw new Error('No redeemScript provided for P2WSH, but scriptSig non-empty');
      }
      witnessProgram = btemplates.witnessScriptHash.output.encode(bcrypto.sha256(witnessScript));
      if (!redeemScript.equals(witnessProgram)) {
        throw new Error('Redeem script didn\'t match witnessScript');
      }
    }

    if (!supportedType(btemplates.classifyOutput(witnessScript))) {
      throw new Error('unsupported witness script');
    }

    script = witnessScript;
    scriptType = witnessScriptType;
    chunks = witnessStack.slice(0, -1);
  } else if (classifyWitness === scriptTypes.P2WPKH) {
    witness = true;
    var key = witnessStack[witnessStack.length - 1];
    var keyHash = bcrypto.hash160(key);
    if (scriptSig.length === 0) {
      prevOutScript = btemplates.witnessPubKeyHash.output.encode(keyHash);
      prevOutType = scriptTypes.P2WPKH;
      if (typeof redeemScript !== 'undefined') {
        throw new Error('Redeem script given when unnecessary');
      }
    } else {
      if (!redeemScript) {
        throw new Error('No redeemScript provided for P2WPKH, but scriptSig wasn\'t empty');
      }
      witnessProgram = btemplates.witnessPubKeyHash.output.encode(keyHash);
      if (!redeemScript.equals(witnessProgram)) {
        throw new Error('Redeem script did not have the right witness program');
      }
    }

    scriptType = scriptTypes.P2PKH;
    chunks = witnessStack;
  } else if (redeemScript) {
    if (!supportedP2SHType(redeemScriptType)) {
      throw new Error('Bad redeemscript!');
    }

    script = redeemScript;
    scriptType = redeemScriptType;
    chunks = scriptSigChunks.slice(0, -1);
  } else {
    prevOutType = scriptType = btemplates.classifyInput(scriptSig);
    chunks = scriptSigChunks;
  }

  var expanded = extractChunks(scriptType, chunks, script);

  var result = {
    pubKeys: expanded.pubKeys,
    signatures: expanded.signatures,
    prevOutScript: prevOutScript,
    prevOutType: prevOutType,
    signType: scriptType,
    signScript: script,
    witness: Boolean(witness)
  };

  if (p2sh) {
    result.redeemScript = redeemScript;
    result.redeemScriptType = redeemScriptType;
  }

  if (p2wsh) {
    result.witnessScript = witnessScript;
    result.witnessScriptType = witnessScriptType;
  }

  return result;
}

// could be done in expandInput, but requires the original Transaction for hashForSignature
function fixMultisigOrder(input, transaction, vin) {
  if (input.redeemScriptType !== scriptTypes.MULTISIG || !input.redeemScript) return;
  if (input.pubKeys.length === input.signatures.length) return;

  var unmatched = input.signatures.concat();

  input.signatures = input.pubKeys.map(function (pubKey) {
    var keyPair = ECPair.fromPublicKeyBuffer(pubKey);
    var match;

    // check for a signature
    unmatched.some(function (signature, i) {
      // skip if undefined || OP_0
      if (!signature) return false;

      // TODO: avoid O(n) hashForSignature
      var parsed = ECSignature.parseScriptSignature(signature);
      var hash = transaction.hashForSignature(vin, input.redeemScript, parsed.hashType);

      // skip if signature does not match pubKey
      if (!keyPair.verify(hash, parsed.signature)) return false;

      // remove matched signature from unmatched
      unmatched[i] = undefined;
      match = signature;

      return true;
    });

    return match;
  });
}

function expandOutput(script, scriptType, ourPubKey) {
  typeforce(types.Buffer, script);

  var scriptChunks = bscript.decompile(script);
  if (!scriptType) {
    scriptType = btemplates.classifyOutput(script);
  }

  var pubKeys = [];

  switch (scriptType) {
    // does our hash160(pubKey) match the output scripts?
    case scriptTypes.P2PKH:
      if (!ourPubKey) break;

      var pkh1 = scriptChunks[2];
      var pkh2 = bcrypto.hash160(ourPubKey);
      if (pkh1.equals(pkh2)) pubKeys = [ourPubKey];
      break;

    // does our hash160(pubKey) match the output scripts?
    case scriptTypes.P2WPKH:
      if (!ourPubKey) break;

      var wpkh1 = scriptChunks[1];
      var wpkh2 = bcrypto.hash160(ourPubKey);
      if (wpkh1.equals(wpkh2)) pubKeys = [ourPubKey];
      break;

    case scriptTypes.P2PK:
      pubKeys = scriptChunks.slice(0, 1);
      break;

    case scriptTypes.MULTISIG:
      pubKeys = scriptChunks.slice(1, -2);
      break;

    default:
      return { scriptType: scriptType };
  }

  return {
    pubKeys: pubKeys,
    scriptType: scriptType,
    signatures: pubKeys.map(function () {
      return undefined;
    })
  };
}

function checkP2SHInput(input, redeemScriptHash) {
  if (input.prevOutType) {
    if (input.prevOutType !== scriptTypes.P2SH) throw new Error('PrevOutScript must be P2SH');

    var prevOutScriptScriptHash = bscript.decompile(input.prevOutScript)[1];
    if (!prevOutScriptScriptHash.equals(redeemScriptHash)) throw new Error('Inconsistent hash160(RedeemScript)');
  }
}

function checkP2WSHInput(input, witnessScriptHash) {
  if (input.prevOutType) {
    if (input.prevOutType !== scriptTypes.P2WSH) throw new Error('PrevOutScript must be P2WSH');

    var scriptHash = bscript.decompile(input.prevOutScript)[1];
    if (!scriptHash.equals(witnessScriptHash)) throw new Error('Inconsistent sha25(WitnessScript)');
  }
}

function prepareInput(input, kpPubKey, redeemScript, witnessValue, witnessScript) {
  var expanded;
  var prevOutType;
  var prevOutScript;

  var p2sh = false;
  var p2shType;
  var redeemScriptHash;

  var witness = false;
  var p2wsh = false;
  var witnessType;
  var witnessScriptHash;

  var signType;
  var signScript;

  if (redeemScript && witnessScript) {
    redeemScriptHash = bcrypto.hash160(redeemScript);
    witnessScriptHash = bcrypto.sha256(witnessScript);
    checkP2SHInput(input, redeemScriptHash);

    if (!redeemScript.equals(btemplates.witnessScriptHash.output.encode(witnessScriptHash))) throw new Error('Witness script inconsistent with redeem script');

    expanded = expandOutput(witnessScript, undefined, kpPubKey);
    if (!expanded.pubKeys) throw new Error('WitnessScript not supported "' + bscript.toASM(redeemScript) + '"');

    prevOutType = btemplates.types.P2SH;
    prevOutScript = btemplates.scriptHash.output.encode(redeemScriptHash);
    p2sh = witness = p2wsh = true;
    p2shType = btemplates.types.P2WSH;
    signType = witnessType = expanded.scriptType;
    signScript = witnessScript;
  } else if (redeemScript) {
    redeemScriptHash = bcrypto.hash160(redeemScript);
    checkP2SHInput(input, redeemScriptHash);

    expanded = expandOutput(redeemScript, undefined, kpPubKey);
    if (!expanded.pubKeys) throw new Error('RedeemScript not supported "' + bscript.toASM(redeemScript) + '"');

    prevOutType = btemplates.types.P2SH;
    prevOutScript = btemplates.scriptHash.output.encode(redeemScriptHash);
    p2sh = true;
    signType = p2shType = expanded.scriptType;
    signScript = redeemScript;
    witness = signType === btemplates.types.P2WPKH;
  } else if (witnessScript) {
    witnessScriptHash = bcrypto.sha256(witnessScript);
    checkP2WSHInput(input, witnessScriptHash);

    expanded = expandOutput(witnessScript, undefined, kpPubKey);
    if (!expanded.pubKeys) throw new Error('WitnessScript not supported "' + bscript.toASM(redeemScript) + '"');

    prevOutType = btemplates.types.P2WSH;
    prevOutScript = btemplates.witnessScriptHash.output.encode(witnessScriptHash);
    witness = p2wsh = true;
    signType = witnessType = expanded.scriptType;
    signScript = witnessScript;
  } else if (input.prevOutType) {
    // embedded scripts are not possible without a redeemScript
    if (input.prevOutType === scriptTypes.P2SH || input.prevOutType === scriptTypes.P2WSH) {
      throw new Error('PrevOutScript is ' + input.prevOutType + ', requires redeemScript');
    }

    prevOutType = input.prevOutType;
    prevOutScript = input.prevOutScript;
    expanded = expandOutput(input.prevOutScript, input.prevOutType, kpPubKey);
    if (!expanded.pubKeys) return;

    witness = input.prevOutType === scriptTypes.P2WPKH;
    signType = prevOutType;
    signScript = prevOutScript;
  } else {
    prevOutScript = btemplates.pubKeyHash.output.encode(bcrypto.hash160(kpPubKey));
    expanded = expandOutput(prevOutScript, scriptTypes.P2PKH, kpPubKey);

    prevOutType = scriptTypes.P2PKH;
    witness = false;
    signType = prevOutType;
    signScript = prevOutScript;
  }

  if (signType === scriptTypes.P2WPKH) {
    signScript = btemplates.pubKeyHash.output.encode(btemplates.witnessPubKeyHash.output.decode(signScript));
  }

  if (p2sh) {
    input.redeemScript = redeemScript;
    input.redeemScriptType = p2shType;
  }

  if (p2wsh) {
    input.witnessScript = witnessScript;
    input.witnessScriptType = witnessType;
  }

  input.pubKeys = expanded.pubKeys;
  input.signatures = expanded.signatures;
  input.signScript = signScript;
  input.signType = signType;
  input.prevOutScript = prevOutScript;
  input.prevOutType = prevOutType;
  input.witness = witness;
}

function buildStack(type, signatures, pubKeys, allowIncomplete) {
  if (type === scriptTypes.P2PKH) {
    if (signatures.length === 1 && Buffer.isBuffer(signatures[0]) && pubKeys.length === 1) return btemplates.pubKeyHash.input.encodeStack(signatures[0], pubKeys[0]);
  } else if (type === scriptTypes.P2PK) {
    if (signatures.length === 1 && Buffer.isBuffer(signatures[0])) return btemplates.pubKey.input.encodeStack(signatures[0]);
  } else if (type === scriptTypes.MULTISIG) {
    if (signatures.length > 0) {
      signatures = signatures.map(function (signature) {
        return signature || ops.OP_0;
      });
      if (!allowIncomplete) {
        // remove blank signatures
        signatures = signatures.filter(function (x) {
          return x !== ops.OP_0;
        });
      }

      return btemplates.multisig.input.encodeStack(signatures);
    }
  } else {
    throw new Error('Not yet supported');
  }

  if (!allowIncomplete) throw new Error('Not enough signatures provided');
  return [];
}

function buildInput(input, allowIncomplete) {
  var scriptType = input.prevOutType;
  var sig = [];
  var witness = [];

  if (supportedType(scriptType)) {
    sig = buildStack(scriptType, input.signatures, input.pubKeys, allowIncomplete);
  }

  var p2sh = false;
  if (scriptType === btemplates.types.P2SH) {
    // We can remove this error later when we have a guarantee prepareInput
    // rejects unsignable scripts - it MUST be signable at this point.
    if (!allowIncomplete && !supportedP2SHType(input.redeemScriptType)) {
      throw new Error('Impossible to sign this type');
    }

    if (supportedType(input.redeemScriptType)) {
      sig = buildStack(input.redeemScriptType, input.signatures, input.pubKeys, allowIncomplete);
    }

    // If it wasn't SIGNABLE, it's witness, defer to that
    if (input.redeemScriptType) {
      p2sh = true;
      scriptType = input.redeemScriptType;
    }
  }

  switch (scriptType) {
    // P2WPKH is a special case of P2PKH
    case btemplates.types.P2WPKH:
      witness = buildStack(btemplates.types.P2PKH, input.signatures, input.pubKeys, allowIncomplete);
      break;

    case btemplates.types.P2WSH:
      // We can remove this check later
      if (!allowIncomplete && !supportedType(input.witnessScriptType)) {
        throw new Error('Impossible to sign this type');
      }

      if (supportedType(input.witnessScriptType)) {
        witness = buildStack(input.witnessScriptType, input.signatures, input.pubKeys, allowIncomplete);
        witness.push(input.witnessScript);
        scriptType = input.witnessScriptType;
      }

      break;
  }

  // append redeemScript if necessary
  if (p2sh) {
    sig.push(input.redeemScript);
  }

  return {
    type: scriptType,
    script: bscript.compile(sig),
    witness: witness
  };
}

function TransactionBuilder(network, maximumFeeRate) {
  this.prevTxMap = {};
  this.network = network || networks.bitcoin;

  // WARNING: This is __NOT__ to be relied on, its just another potential safety mechanism (safety in-depth)
  this.maximumFeeRate = maximumFeeRate || 2500;

  this.inputs = [];
  this.tx = new Transaction();
}

TransactionBuilder.prototype.setLockTime = function (locktime) {
  typeforce(types.UInt32, locktime);

  // if any signatures exist, throw
  if (this.inputs.some(function (input) {
    if (!input.signatures) return false;

    return input.signatures.some(function (s) {
      return s;
    });
  })) {
    throw new Error('No, this would invalidate signatures');
  }

  this.tx.locktime = locktime;
};

TransactionBuilder.prototype.setVersion = function (version) {
  typeforce(types.UInt32, version);

  // XXX: this might eventually become more complex depending on what the versions represent
  this.tx.version = version;
};

TransactionBuilder.fromTransaction = function (transaction, network) {
  var txb = new TransactionBuilder(network);

  // Copy transaction fields
  txb.setVersion(transaction.version);
  txb.setLockTime(transaction.locktime);

  // Copy outputs (done first to avoid signature invalidation)
  transaction.outs.forEach(function (txOut) {
    txb.addOutput(txOut.script, txOut.value);
  });

  // Copy inputs
  transaction.ins.forEach(function (txIn) {
    txb.__addInputUnsafe(txIn.hash, txIn.index, {
      sequence: txIn.sequence,
      script: txIn.script,
      witness: txIn.witness
    });
  });

  // fix some things not possible through the public API
  txb.inputs.forEach(function (input, i) {
    fixMultisigOrder(input, transaction, i);
  });

  return txb;
};

TransactionBuilder.prototype.addInput = function (txHash, vout, sequence, prevOutScript) {
  if (!this.__canModifyInputs()) {
    throw new Error('No, this would invalidate signatures');
  }

  var value;

  // is it a hex string?
  if (typeof txHash === 'string') {
    // transaction hashs's are displayed in reverse order, un-reverse it
    txHash = Buffer.from(txHash, 'hex').reverse();

    // is it a Transaction object?
  } else if (txHash instanceof Transaction) {
    var txOut = txHash.outs[vout];
    prevOutScript = txOut.script;
    value = txOut.value;

    txHash = txHash.getHash();
  }

  return this.__addInputUnsafe(txHash, vout, {
    sequence: sequence,
    prevOutScript: prevOutScript,
    value: value
  });
};

TransactionBuilder.prototype.__addInputUnsafe = function (txHash, vout, options) {
  if (Transaction.isCoinbaseHash(txHash)) {
    throw new Error('coinbase inputs not supported');
  }

  var prevTxOut = txHash.toString('hex') + ':' + vout;
  if (this.prevTxMap[prevTxOut] !== undefined) throw new Error('Duplicate TxOut: ' + prevTxOut);

  var input = {};

  // derive what we can from the scriptSig
  if (options.script !== undefined) {
    input = expandInput(options.script, options.witness || []);
  }

  // if an input value was given, retain it
  if (options.value !== undefined) {
    input.value = options.value;
  }

  // derive what we can from the previous transactions output script
  if (!input.prevOutScript && options.prevOutScript) {
    var prevOutType;

    if (!input.pubKeys && !input.signatures) {
      var expanded = expandOutput(options.prevOutScript);

      if (expanded.pubKeys) {
        input.pubKeys = expanded.pubKeys;
        input.signatures = expanded.signatures;
      }

      prevOutType = expanded.scriptType;
    }

    input.prevOutScript = options.prevOutScript;
    input.prevOutType = prevOutType || btemplates.classifyOutput(options.prevOutScript);
  }

  var vin = this.tx.addInput(txHash, vout, options.sequence, options.scriptSig);
  this.inputs[vin] = input;
  this.prevTxMap[prevTxOut] = vin;
  return vin;
};

TransactionBuilder.prototype.addOutput = function (scriptPubKey, value) {
  if (!this.__canModifyOutputs()) {
    throw new Error('No, this would invalidate signatures');
  }

  // Attempt to get a script if it's a base58 address string
  if (typeof scriptPubKey === 'string') {
    scriptPubKey = baddress.toOutputScript(scriptPubKey, this.network);
  }

  return this.tx.addOutput(scriptPubKey, value);
};

TransactionBuilder.prototype.build = function () {
  return this.__build(false);
};
TransactionBuilder.prototype.buildIncomplete = function () {
  return this.__build(true);
};

TransactionBuilder.prototype.__build = function (allowIncomplete) {
  if (!allowIncomplete) {
    if (!this.tx.ins.length) throw new Error('Transaction has no inputs');
    if (!this.tx.outs.length) throw new Error('Transaction has no outputs');
  }

  var tx = this.tx.clone();
  // Create script signatures from inputs
  this.inputs.forEach(function (input, i) {
    var scriptType = input.witnessScriptType || input.redeemScriptType || input.prevOutType;
    if (!scriptType && !allowIncomplete) throw new Error('Transaction is not complete');
    var result = buildInput(input, allowIncomplete);

    // skip if no result
    if (!allowIncomplete) {
      if (!supportedType(result.type) && result.type !== btemplates.types.P2WPKH) {
        throw new Error(result.type + ' not supported');
      }
    }

    tx.setInputScript(i, result.script);
    tx.setWitness(i, result.witness);
  });

  if (!allowIncomplete) {
    // do not rely on this, its merely a last resort
    if (this.__overMaximumFees(tx.virtualSize())) {
      throw new Error('Transaction has absurd fees');
    }
  }

  return tx;
};

function canSign(input) {
  return input.prevOutScript !== undefined && input.signScript !== undefined && input.pubKeys !== undefined && input.signatures !== undefined && input.signatures.length === input.pubKeys.length && input.pubKeys.length > 0 && (input.witness === false || input.witness === true && input.value !== undefined);
}

TransactionBuilder.prototype.sign = function (vin, keyPair, redeemScript, hashType, witnessValue, witnessScript) {
  // TODO: remove keyPair.network matching in 4.0.0
  if (keyPair.network && keyPair.network !== this.network) throw new TypeError('Inconsistent network');
  if (!this.inputs[vin]) throw new Error('No input at index: ' + vin);
  hashType = hashType || Transaction.SIGHASH_ALL;

  var input = this.inputs[vin];

  // if redeemScript was previously provided, enforce consistency
  if (input.redeemScript !== undefined && redeemScript && !input.redeemScript.equals(redeemScript)) {
    throw new Error('Inconsistent redeemScript');
  }

  var kpPubKey = keyPair.publicKey || keyPair.getPublicKeyBuffer();
  if (!canSign(input)) {
    if (witnessValue !== undefined) {
      if (input.value !== undefined && input.value !== witnessValue) throw new Error('Input didn\'t match witnessValue');
      typeforce(types.Satoshi, witnessValue);
      input.value = witnessValue;
    }

    if (!canSign(input)) prepareInput(input, kpPubKey, redeemScript, witnessValue, witnessScript);
    if (!canSign(input)) throw Error(input.prevOutType + ' not supported');
  }

  // ready to sign
  var signatureHash;
  if (input.witness) {
    signatureHash = this.tx.hashForWitnessV0(vin, input.signScript, input.value, hashType);
  } else {
    signatureHash = this.tx.hashForSignature(vin, input.signScript, hashType);
  }

  // enforce in order signing of public keys
  var signed = input.pubKeys.some(function (pubKey, i) {
    if (!kpPubKey.equals(pubKey)) return false;
    if (input.signatures[i]) throw new Error('Signature already exists');
    if (kpPubKey.length !== 33 && input.signType === scriptTypes.P2WPKH) throw new Error('BIP143 rejects uncompressed public keys in P2WPKH or P2WSH');

    var signature = keyPair.sign(signatureHash);
    if (Buffer.isBuffer(signature)) signature = ECSignature.fromRSBuffer(signature);

    input.signatures[i] = signature.toScriptSignature(hashType);
    return true;
  });

  if (!signed) throw new Error('Key pair cannot sign for this input');
};

function signatureHashType(buffer) {
  return buffer.readUInt8(buffer.length - 1);
}

TransactionBuilder.prototype.__canModifyInputs = function () {
  return this.inputs.every(function (input) {
    // any signatures?
    if (input.signatures === undefined) return true;

    return input.signatures.every(function (signature) {
      if (!signature) return true;
      var hashType = signatureHashType(signature);

      // if SIGHASH_ANYONECANPAY is set, signatures would not
      // be invalidated by more inputs
      return hashType & Transaction.SIGHASH_ANYONECANPAY;
    });
  });
};

TransactionBuilder.prototype.__canModifyOutputs = function () {
  var nInputs = this.tx.ins.length;
  var nOutputs = this.tx.outs.length;

  return this.inputs.every(function (input) {
    if (input.signatures === undefined) return true;

    return input.signatures.every(function (signature) {
      if (!signature) return true;
      var hashType = signatureHashType(signature);

      var hashTypeMod = hashType & 0x1f;
      if (hashTypeMod === Transaction.SIGHASH_NONE) return true;
      if (hashTypeMod === Transaction.SIGHASH_SINGLE) {
        // if SIGHASH_SINGLE is set, and nInputs > nOutputs
        // some signatures would be invalidated by the addition
        // of more outputs
        return nInputs <= nOutputs;
      }
    });
  });
};

TransactionBuilder.prototype.__overMaximumFees = function (bytes) {
  // not all inputs will have .value defined
  var incoming = this.inputs.reduce(function (a, x) {
    return a + (x.value >>> 0);
  }, 0);

  // but all outputs do, and if we have any input value
  // we can immediately determine if the outputs are too small
  var outgoing = this.tx.outs.reduce(function (a, x) {
    return a + x.value;
  }, 0);
  var fee = incoming - outgoing;
  var feeRate = fee / bytes;

  return feeRate > this.maximumFeeRate;
};

module.exports = TransactionBuilder;

},{"./address":43,"./crypto":46,"./ecpair":48,"./ecsignature":49,"./networks":52,"./script":53,"./templates":55,"./transaction":77,"./types":79,"bitcoin-ops":41,"safe-buffer":591,"typeforce":605}],79:[function(require,module,exports){
'use strict';

var typeforce = require('typeforce');

var UINT31_MAX = Math.pow(2, 31) - 1;
function UInt31(value) {
  return typeforce.UInt32(value) && value <= UINT31_MAX;
}

function BIP32Path(value) {
  return typeforce.String(value) && value.match(/^(m\/)?(\d+'?\/)*\d+'?$/);
}
BIP32Path.toJSON = function () {
  return 'BIP32 derivation path';
};

var SATOSHI_MAX = 21 * 1e14;
function Satoshi(value) {
  return typeforce.UInt53(value) && value <= SATOSHI_MAX;
}

// external dependent types
var BigInt = typeforce.quacksLike('BigInteger');
var ECPoint = typeforce.quacksLike('Point');

// exposed, external API
var ECSignature = typeforce.compile({ r: BigInt, s: BigInt });
var Network = typeforce.compile({
  messagePrefix: typeforce.oneOf(typeforce.Buffer, typeforce.String),
  bip32: {
    public: typeforce.UInt32,
    private: typeforce.UInt32
  },
  pubKeyHash: typeforce.UInt16,
  scriptHash: typeforce.UInt16,
  wif: typeforce.UInt8
});

// extend typeforce types with ours
var types = {
  BigInt: BigInt,
  BIP32Path: BIP32Path,
  Buffer256bit: typeforce.BufferN(32),
  ECPoint: ECPoint,
  ECSignature: ECSignature,
  Hash160bit: typeforce.BufferN(20),
  Hash256bit: typeforce.BufferN(32),
  Network: Network,
  Satoshi: Satoshi,
  UInt31: UInt31
};

for (var typeName in typeforce) {
  types[typeName] = typeforce[typeName];
}

module.exports = types;

},{"typeforce":605}],80:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var bech32 = require('bech32');
var bs58check = require('bs58check');
var bscript = require('./script');
var btemplates = require('./templates');
var networks = require('./networks');
var typeforce = require('typeforce');
var types = require('./types');

function fromBase58Check(address) {
  var payload = bs58check.decode(address);

  // TODO: 4.0.0, move to "toOutputScript"
  if (payload.length < 21) throw new TypeError(address + ' is too short');
  if (payload.length > 21) throw new TypeError(address + ' is too long');

  var version = payload.readUInt8(0);
  var hash = payload.slice(1);

  return { version: version, hash: hash };
}

function fromBech32(address) {
  var result = bech32.decode(address);
  var data = bech32.fromWords(result.words.slice(1));

  return {
    version: result.words[0],
    prefix: result.prefix,
    data: Buffer.from(data)
  };
}

function toBase58Check(hash, version) {
  typeforce(types.tuple(types.Hash160bit, types.UInt8), arguments);

  var payload = Buffer.allocUnsafe(21);
  payload.writeUInt8(version, 0);
  hash.copy(payload, 1);

  return bs58check.encode(payload);
}

function toBech32(data, version, prefix) {
  var words = bech32.toWords(data);
  words.unshift(version);

  return bech32.encode(prefix, words);
}

function fromOutputScript(outputScript, network) {
  network = network || networks.bitcoin;

  if (btemplates.pubKeyHash.output.check(outputScript)) return toBase58Check(bscript.compile(outputScript).slice(3, 23), network.pubKeyHash);
  if (btemplates.scriptHash.output.check(outputScript)) return toBase58Check(bscript.compile(outputScript).slice(2, 22), network.scriptHash);
  if (btemplates.witnessPubKeyHash.output.check(outputScript)) return toBech32(bscript.compile(outputScript).slice(2, 22), 0, network.bech32);
  if (btemplates.witnessScriptHash.output.check(outputScript)) return toBech32(bscript.compile(outputScript).slice(2, 34), 0, network.bech32);

  throw new Error(bscript.toASM(outputScript) + ' has no matching Address');
}

function toOutputScript(address, network) {
  network = network || networks.bitcoin;

  var decode;
  try {
    decode = fromBase58Check(address);
  } catch (e) {}

  if (decode) {
    if (decode.version === network.pubKeyHash) return btemplates.pubKeyHash.output.encode(decode.hash);
    if (decode.version === network.scriptHash) return btemplates.scriptHash.output.encode(decode.hash);
  } else {
    try {
      decode = fromBech32(address);
    } catch (e) {}

    if (decode) {
      if (decode.prefix !== network.bech32) throw new Error(address + ' has an invalid prefix');
      if (decode.version === 0) {
        if (decode.data.length === 20) return btemplates.witnessPubKeyHash.output.encode(decode.data);
        if (decode.data.length === 32) return btemplates.witnessScriptHash.output.encode(decode.data);
      }
    }
  }

  throw new Error(address + ' has no matching Script');
}

module.exports = {
  fromBase58Check: fromBase58Check,
  fromBech32: fromBech32,
  fromOutputScript: fromOutputScript,
  toBase58Check: toBase58Check,
  toBech32: toBech32,
  toOutputScript: toOutputScript
};

},{"./networks":89,"./script":90,"./templates":92,"./types":116,"bech32":35,"bs58check":120,"safe-buffer":591,"typeforce":605}],81:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var bcrypto = require('./crypto');
var fastMerkleRoot = require('merkle-lib/fastRoot');
var typeforce = require('typeforce');
var types = require('./types');
var varuint = require('varuint-bitcoin');

var Transaction = require('./transaction');

function Block() {
  this.version = 1;
  this.prevHash = null;
  this.merkleRoot = null;
  this.timestamp = 0;
  this.bits = 0;
  this.nonce = 0;
}

Block.fromBuffer = function (buffer) {
  if (buffer.length < 80) throw new Error('Buffer too small (< 80 bytes)');

  var offset = 0;
  function readSlice(n) {
    offset += n;
    return buffer.slice(offset - n, offset);
  }

  function readUInt32() {
    var i = buffer.readUInt32LE(offset);
    offset += 4;
    return i;
  }

  function readInt32() {
    var i = buffer.readInt32LE(offset);
    offset += 4;
    return i;
  }

  var block = new Block();
  block.version = readInt32();
  block.prevHash = readSlice(32);
  block.merkleRoot = readSlice(32);
  block.timestamp = readUInt32();
  block.bits = readUInt32();
  block.nonce = readUInt32();

  if (buffer.length === 80) return block;

  function readVarInt() {
    var vi = varuint.decode(buffer, offset);
    offset += varuint.decode.bytes;
    return vi;
  }

  function readTransaction() {
    var tx = Transaction.fromBuffer(buffer.slice(offset), true);
    offset += tx.byteLength();
    return tx;
  }

  var nTransactions = readVarInt();
  block.transactions = [];

  for (var i = 0; i < nTransactions; ++i) {
    var tx = readTransaction();
    block.transactions.push(tx);
  }

  return block;
};

Block.prototype.byteLength = function (headersOnly) {
  if (headersOnly || !this.transactions) return 80;

  return 80 + varuint.encodingLength(this.transactions.length) + this.transactions.reduce(function (a, x) {
    return a + x.byteLength();
  }, 0);
};

Block.fromHex = function (hex) {
  return Block.fromBuffer(Buffer.from(hex, 'hex'));
};

Block.prototype.getHash = function () {
  return bcrypto.hash256(this.toBuffer(true));
};

Block.prototype.getId = function () {
  return this.getHash().reverse().toString('hex');
};

Block.prototype.getUTCDate = function () {
  var date = new Date(0); // epoch
  date.setUTCSeconds(this.timestamp);

  return date;
};

// TODO: buffer, offset compatibility
Block.prototype.toBuffer = function (headersOnly) {
  var buffer = Buffer.allocUnsafe(this.byteLength(headersOnly));

  var offset = 0;
  function writeSlice(slice) {
    slice.copy(buffer, offset);
    offset += slice.length;
  }

  function writeInt32(i) {
    buffer.writeInt32LE(i, offset);
    offset += 4;
  }
  function writeUInt32(i) {
    buffer.writeUInt32LE(i, offset);
    offset += 4;
  }

  writeInt32(this.version);
  writeSlice(this.prevHash);
  writeSlice(this.merkleRoot);
  writeUInt32(this.timestamp);
  writeUInt32(this.bits);
  writeUInt32(this.nonce);

  if (headersOnly || !this.transactions) return buffer;

  varuint.encode(this.transactions.length, buffer, offset);
  offset += varuint.encode.bytes;

  this.transactions.forEach(function (tx) {
    var txSize = tx.byteLength(); // TODO: extract from toBuffer?
    tx.toBuffer(buffer, offset);
    offset += txSize;
  });

  return buffer;
};

Block.prototype.toHex = function (headersOnly) {
  return this.toBuffer(headersOnly).toString('hex');
};

Block.calculateTarget = function (bits) {
  var exponent = ((bits & 0xff000000) >> 24) - 3;
  var mantissa = bits & 0x007fffff;
  var target = Buffer.alloc(32, 0);
  target.writeUInt32BE(mantissa, 28 - exponent);
  return target;
};

Block.calculateMerkleRoot = function (transactions) {
  typeforce([{ getHash: types.Function }], transactions);
  if (transactions.length === 0) throw TypeError('Cannot compute merkle root for zero transactions');

  var hashes = transactions.map(function (transaction) {
    return transaction.getHash();
  });

  return fastMerkleRoot(hashes, bcrypto.hash256);
};

Block.prototype.checkMerkleRoot = function () {
  if (!this.transactions) return false;

  var actualMerkleRoot = Block.calculateMerkleRoot(this.transactions);
  return this.merkleRoot.compare(actualMerkleRoot) === 0;
};

Block.prototype.checkProofOfWork = function () {
  var hash = this.getHash().reverse();
  var target = Block.calculateTarget(this.bits);

  return hash.compare(target) <= 0;
};

module.exports = Block;

},{"./crypto":83,"./transaction":114,"./types":116,"merkle-lib/fastRoot":570,"safe-buffer":591,"typeforce":605,"varuint-bitcoin":611}],82:[function(require,module,exports){
arguments[4][45][0].apply(exports,arguments)
},{"dup":45,"pushdata-bitcoin":573,"varuint-bitcoin":611}],83:[function(require,module,exports){
arguments[4][46][0].apply(exports,arguments)
},{"create-hash":553,"dup":46}],84:[function(require,module,exports){
arguments[4][47][0].apply(exports,arguments)
},{"./ecsignature":86,"./types":116,"bigi":38,"create-hmac":555,"dup":47,"ecurve":559,"safe-buffer":591,"typeforce":605}],85:[function(require,module,exports){
arguments[4][48][0].apply(exports,arguments)
},{"./address":80,"./crypto":83,"./ecdsa":84,"./networks":89,"./types":116,"bigi":38,"dup":48,"ecurve":559,"randombytes":574,"typeforce":605,"wif":612}],86:[function(require,module,exports){
arguments[4][49][0].apply(exports,arguments)
},{"./types":116,"bigi":38,"bip66":40,"buffer":121,"dup":49,"typeforce":605}],87:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var base58check = require('bs58check');
var bcrypto = require('./crypto');
var createHmac = require('create-hmac');
var typeforce = require('typeforce');
var types = require('./types');
var NETWORKS = require('./networks');

var BigInteger = require('bigi');
var ECPair = require('./ecpair');

var ecurve = require('ecurve');
var curve = ecurve.getCurveByName('secp256k1');

function HDNode(keyPair, chainCode) {
  typeforce(types.tuple('ECPair', types.Buffer256bit), arguments);

  if (!keyPair.compressed) throw new TypeError('BIP32 only allows compressed keyPairs');

  this.keyPair = keyPair;
  this.chainCode = chainCode;
  this.depth = 0;
  this.index = 0;
  this.parentFingerprint = 0x00000000;
}

HDNode.HIGHEST_BIT = 0x80000000;
HDNode.LENGTH = 78;
HDNode.MASTER_SECRET = Buffer.from('Bitcoin seed', 'utf8');

HDNode.fromSeedBuffer = function (seed, network) {
  typeforce(types.tuple(types.Buffer, types.maybe(types.Network)), arguments);

  if (seed.length < 16) throw new TypeError('Seed should be at least 128 bits');
  if (seed.length > 64) throw new TypeError('Seed should be at most 512 bits');

  var I = createHmac('sha512', HDNode.MASTER_SECRET).update(seed).digest();
  var IL = I.slice(0, 32);
  var IR = I.slice(32);

  // In case IL is 0 or >= n, the master key is invalid
  // This is handled by the ECPair constructor
  var pIL = BigInteger.fromBuffer(IL);
  var keyPair = new ECPair(pIL, null, {
    network: network
  });

  return new HDNode(keyPair, IR);
};

HDNode.fromSeedHex = function (hex, network) {
  return HDNode.fromSeedBuffer(Buffer.from(hex, 'hex'), network);
};

HDNode.fromBase58 = function (string, networks) {
  var buffer = base58check.decode(string);
  if (buffer.length !== 78) throw new Error('Invalid buffer length');

  // 4 bytes: version bytes
  var version = buffer.readUInt32BE(0);
  var network;

  // list of networks?
  if (Array.isArray(networks)) {
    network = networks.filter(function (x) {
      return version === x.bip32.private || version === x.bip32.public;
    }).pop();

    if (!network) throw new Error('Unknown network version');

    // otherwise, assume a network object (or default to bitcoin)
  } else {
    network = networks || NETWORKS.bitcoin;
  }

  if (version !== network.bip32.private && version !== network.bip32.public) throw new Error('Invalid network version');

  // 1 byte: depth: 0x00 for master nodes, 0x01 for level-1 descendants, ...
  var depth = buffer[4];

  // 4 bytes: the fingerprint of the parent's key (0x00000000 if master key)
  var parentFingerprint = buffer.readUInt32BE(5);
  if (depth === 0) {
    if (parentFingerprint !== 0x00000000) throw new Error('Invalid parent fingerprint');
  }

  // 4 bytes: child number. This is the number i in xi = xpar/i, with xi the key being serialized.
  // This is encoded in MSB order. (0x00000000 if master key)
  var index = buffer.readUInt32BE(9);
  if (depth === 0 && index !== 0) throw new Error('Invalid index');

  // 32 bytes: the chain code
  var chainCode = buffer.slice(13, 45);
  var keyPair;

  // 33 bytes: private key data (0x00 + k)
  if (version === network.bip32.private) {
    if (buffer.readUInt8(45) !== 0x00) throw new Error('Invalid private key');

    var d = BigInteger.fromBuffer(buffer.slice(46, 78));
    keyPair = new ECPair(d, null, { network: network });

    // 33 bytes: public key data (0x02 + X or 0x03 + X)
  } else {
    var Q = ecurve.Point.decodeFrom(curve, buffer.slice(45, 78));
    // Q.compressed is assumed, if somehow this assumption is broken, `new HDNode` will throw

    // Verify that the X coordinate in the public point corresponds to a point on the curve.
    // If not, the extended public key is invalid.
    curve.validate(Q);

    keyPair = new ECPair(null, Q, { network: network });
  }

  var hd = new HDNode(keyPair, chainCode);
  hd.depth = depth;
  hd.index = index;
  hd.parentFingerprint = parentFingerprint;

  return hd;
};

HDNode.prototype.getAddress = function () {
  return this.keyPair.getAddress();
};

HDNode.prototype.getIdentifier = function () {
  return bcrypto.hash160(this.keyPair.getPublicKeyBuffer());
};

HDNode.prototype.getFingerprint = function () {
  return this.getIdentifier().slice(0, 4);
};

HDNode.prototype.getNetwork = function () {
  return this.keyPair.getNetwork();
};

HDNode.prototype.getPublicKeyBuffer = function () {
  return this.keyPair.getPublicKeyBuffer();
};

HDNode.prototype.neutered = function () {
  var neuteredKeyPair = new ECPair(null, this.keyPair.Q, {
    network: this.keyPair.network
  });

  var neutered = new HDNode(neuteredKeyPair, this.chainCode);
  neutered.depth = this.depth;
  neutered.index = this.index;
  neutered.parentFingerprint = this.parentFingerprint;

  return neutered;
};

HDNode.prototype.sign = function (hash) {
  return this.keyPair.sign(hash);
};

HDNode.prototype.verify = function (hash, signature) {
  return this.keyPair.verify(hash, signature);
};

HDNode.prototype.toBase58 = function (__isPrivate) {
  if (__isPrivate !== undefined) throw new TypeError('Unsupported argument in 2.0.0');

  // Version
  var network = this.keyPair.network;
  var version = !this.isNeutered() ? network.bip32.private : network.bip32.public;
  var buffer = Buffer.allocUnsafe(78);

  // 4 bytes: version bytes
  buffer.writeUInt32BE(version, 0);

  // 1 byte: depth: 0x00 for master nodes, 0x01 for level-1 descendants, ....
  buffer.writeUInt8(this.depth, 4);

  // 4 bytes: the fingerprint of the parent's key (0x00000000 if master key)
  buffer.writeUInt32BE(this.parentFingerprint, 5);

  // 4 bytes: child number. This is the number i in xi = xpar/i, with xi the key being serialized.
  // This is encoded in big endian. (0x00000000 if master key)
  buffer.writeUInt32BE(this.index, 9);

  // 32 bytes: the chain code
  this.chainCode.copy(buffer, 13);

  // 33 bytes: the public key or private key data
  if (!this.isNeutered()) {
    // 0x00 + k for private keys
    buffer.writeUInt8(0, 45);
    this.keyPair.d.toBuffer(32).copy(buffer, 46);

    // 33 bytes: the public key
  } else {
    // X9.62 encoding for public keys
    this.keyPair.getPublicKeyBuffer().copy(buffer, 45);
  }

  return base58check.encode(buffer);
};

// https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki#child-key-derivation-ckd-functions
HDNode.prototype.derive = function (index) {
  typeforce(types.UInt32, index);

  var isHardened = index >= HDNode.HIGHEST_BIT;
  var data = Buffer.allocUnsafe(37);

  // Hardened child
  if (isHardened) {
    if (this.isNeutered()) throw new TypeError('Could not derive hardened child key');

    // data = 0x00 || ser256(kpar) || ser32(index)
    data[0] = 0x00;
    this.keyPair.d.toBuffer(32).copy(data, 1);
    data.writeUInt32BE(index, 33);

    // Normal child
  } else {
    // data = serP(point(kpar)) || ser32(index)
    //      = serP(Kpar) || ser32(index)
    this.keyPair.getPublicKeyBuffer().copy(data, 0);
    data.writeUInt32BE(index, 33);
  }

  var I = createHmac('sha512', this.chainCode).update(data).digest();
  var IL = I.slice(0, 32);
  var IR = I.slice(32);

  var pIL = BigInteger.fromBuffer(IL);

  // In case parse256(IL) >= n, proceed with the next value for i
  if (pIL.compareTo(curve.n) >= 0) {
    return this.derive(index + 1);
  }

  // Private parent key -> private child key
  var derivedKeyPair;
  if (!this.isNeutered()) {
    // ki = parse256(IL) + kpar (mod n)
    var ki = pIL.add(this.keyPair.d).mod(curve.n);

    // In case ki == 0, proceed with the next value for i
    if (ki.signum() === 0) {
      return this.derive(index + 1);
    }

    derivedKeyPair = new ECPair(ki, null, {
      network: this.keyPair.network
    });

    // Public parent key -> public child key
  } else {
    // Ki = point(parse256(IL)) + Kpar
    //    = G*IL + Kpar
    var Ki = curve.G.multiply(pIL).add(this.keyPair.Q);

    // In case Ki is the point at infinity, proceed with the next value for i
    if (curve.isInfinity(Ki)) {
      return this.derive(index + 1);
    }

    derivedKeyPair = new ECPair(null, Ki, {
      network: this.keyPair.network
    });
  }

  var hd = new HDNode(derivedKeyPair, IR);
  hd.depth = this.depth + 1;
  hd.index = index;
  hd.parentFingerprint = this.getFingerprint().readUInt32BE(0);

  return hd;
};

HDNode.prototype.deriveHardened = function (index) {
  typeforce(types.UInt31, index);

  // Only derives hardened private keys by default
  return this.derive(index + HDNode.HIGHEST_BIT);
};

// Private === not neutered
// Public === neutered
HDNode.prototype.isNeutered = function () {
  return !this.keyPair.d;
};

HDNode.prototype.derivePath = function (path) {
  typeforce(types.BIP32Path, path);

  var splitPath = path.split('/');
  if (splitPath[0] === 'm') {
    if (this.parentFingerprint) {
      throw new Error('Not a master node');
    }

    splitPath = splitPath.slice(1);
  }

  return splitPath.reduce(function (prevHd, indexStr) {
    var index;
    if (indexStr.slice(-1) === "'") {
      index = parseInt(indexStr.slice(0, -1), 10);
      return prevHd.deriveHardened(index);
    } else {
      index = parseInt(indexStr, 10);
      return prevHd.derive(index);
    }
  }, this);
};

module.exports = HDNode;

},{"./crypto":83,"./ecpair":85,"./networks":89,"./types":116,"bigi":38,"bs58check":120,"create-hmac":555,"ecurve":559,"safe-buffer":591,"typeforce":605}],88:[function(require,module,exports){
arguments[4][51][0].apply(exports,arguments)
},{"./address":80,"./block":81,"./bufferutils":82,"./crypto":83,"./ecpair":85,"./ecsignature":86,"./hdnode":87,"./networks":89,"./script":90,"./templates":92,"./transaction":114,"./transaction_builder":115,"bitcoin-ops":41,"dup":51}],89:[function(require,module,exports){
arguments[4][52][0].apply(exports,arguments)
},{"dup":52}],90:[function(require,module,exports){
arguments[4][53][0].apply(exports,arguments)
},{"./script_number":91,"./types":116,"bip66":40,"bitcoin-ops":41,"bitcoin-ops/map":42,"dup":53,"pushdata-bitcoin":573,"safe-buffer":591,"typeforce":605}],91:[function(require,module,exports){
arguments[4][54][0].apply(exports,arguments)
},{"dup":54,"safe-buffer":591}],92:[function(require,module,exports){
arguments[4][55][0].apply(exports,arguments)
},{"../script":90,"./multisig":93,"./nulldata":96,"./pubkey":97,"./pubkeyhash":100,"./scripthash":103,"./witnesscommitment":106,"./witnesspubkeyhash":108,"./witnessscripthash":111,"dup":55}],93:[function(require,module,exports){
arguments[4][56][0].apply(exports,arguments)
},{"./input":94,"./output":95,"dup":56}],94:[function(require,module,exports){
arguments[4][57][0].apply(exports,arguments)
},{"../../script":90,"./output":95,"bitcoin-ops":41,"dup":57,"safe-buffer":591,"typeforce":605}],95:[function(require,module,exports){
arguments[4][58][0].apply(exports,arguments)
},{"../../script":90,"../../types":116,"bitcoin-ops":41,"dup":58,"typeforce":605}],96:[function(require,module,exports){
'use strict';

// OP_RETURN {data}

var bscript = require('../script');
var types = require('../types');
var typeforce = require('typeforce');
var OPS = require('bitcoin-ops');

function check(script) {
  var buffer = bscript.compile(script);

  return buffer.length > 1 && buffer[0] === OPS.OP_RETURN;
}
check.toJSON = function () {
  return 'null data output';
};

function encode(data) {
  typeforce(types.Buffer, data);

  return bscript.compile([OPS.OP_RETURN, data]);
}

function decode(buffer) {
  typeforce(check, buffer);

  return buffer.slice(2);
}

module.exports = {
  output: {
    check: check,
    decode: decode,
    encode: encode
  }
};

},{"../script":90,"../types":116,"bitcoin-ops":41,"typeforce":605}],97:[function(require,module,exports){
arguments[4][56][0].apply(exports,arguments)
},{"./input":98,"./output":99,"dup":56}],98:[function(require,module,exports){
arguments[4][61][0].apply(exports,arguments)
},{"../../script":90,"dup":61,"typeforce":605}],99:[function(require,module,exports){
arguments[4][62][0].apply(exports,arguments)
},{"../../script":90,"bitcoin-ops":41,"dup":62,"typeforce":605}],100:[function(require,module,exports){
arguments[4][56][0].apply(exports,arguments)
},{"./input":101,"./output":102,"dup":56}],101:[function(require,module,exports){
arguments[4][64][0].apply(exports,arguments)
},{"../../script":90,"dup":64,"typeforce":605}],102:[function(require,module,exports){
arguments[4][65][0].apply(exports,arguments)
},{"../../script":90,"../../types":116,"bitcoin-ops":41,"dup":65,"typeforce":605}],103:[function(require,module,exports){
arguments[4][56][0].apply(exports,arguments)
},{"./input":104,"./output":105,"dup":56}],104:[function(require,module,exports){
arguments[4][67][0].apply(exports,arguments)
},{"../../script":90,"../multisig/":93,"../pubkey/":97,"../pubkeyhash/":100,"../witnesspubkeyhash/output":110,"../witnessscripthash/output":113,"dup":67,"safe-buffer":591,"typeforce":605}],105:[function(require,module,exports){
arguments[4][68][0].apply(exports,arguments)
},{"../../script":90,"../../types":116,"bitcoin-ops":41,"dup":68,"typeforce":605}],106:[function(require,module,exports){
arguments[4][69][0].apply(exports,arguments)
},{"./output":107,"dup":69}],107:[function(require,module,exports){
arguments[4][70][0].apply(exports,arguments)
},{"../../script":90,"../../types":116,"bitcoin-ops":41,"dup":70,"safe-buffer":591,"typeforce":605}],108:[function(require,module,exports){
arguments[4][56][0].apply(exports,arguments)
},{"./input":109,"./output":110,"dup":56}],109:[function(require,module,exports){
arguments[4][72][0].apply(exports,arguments)
},{"../../script":90,"dup":72,"typeforce":605}],110:[function(require,module,exports){
arguments[4][73][0].apply(exports,arguments)
},{"../../script":90,"../../types":116,"bitcoin-ops":41,"dup":73,"typeforce":605}],111:[function(require,module,exports){
arguments[4][56][0].apply(exports,arguments)
},{"./input":112,"./output":113,"dup":56}],112:[function(require,module,exports){
arguments[4][75][0].apply(exports,arguments)
},{"../../../../is-buffer/index.js":566,"../../script":90,"../../types":116,"../multisig/":93,"../pubkey/":97,"../pubkeyhash/":100,"dup":75,"typeforce":605}],113:[function(require,module,exports){
arguments[4][76][0].apply(exports,arguments)
},{"../../script":90,"../../types":116,"bitcoin-ops":41,"dup":76,"typeforce":605}],114:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var bcrypto = require('./crypto');
var bscript = require('./script');
var bufferutils = require('./bufferutils');
var opcodes = require('bitcoin-ops');
var typeforce = require('typeforce');
var types = require('./types');
var varuint = require('varuint-bitcoin');

function varSliceSize(someScript) {
  var length = someScript.length;

  return varuint.encodingLength(length) + length;
}

function vectorSize(someVector) {
  var length = someVector.length;

  return varuint.encodingLength(length) + someVector.reduce(function (sum, witness) {
    return sum + varSliceSize(witness);
  }, 0);
}

function Transaction() {
  this.version = 1;
  this.locktime = 0;
  this.ins = [];
  this.outs = [];
}

Transaction.DEFAULT_SEQUENCE = 0xffffffff;
Transaction.SIGHASH_ALL = 0x01;
Transaction.SIGHASH_NONE = 0x02;
Transaction.SIGHASH_SINGLE = 0x03;
Transaction.SIGHASH_ANYONECANPAY = 0x80;
Transaction.ADVANCED_TRANSACTION_MARKER = 0x00;
Transaction.ADVANCED_TRANSACTION_FLAG = 0x01;

var EMPTY_SCRIPT = Buffer.allocUnsafe(0);
var EMPTY_WITNESS = [];
var ZERO = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
var ONE = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
var VALUE_UINT64_MAX = Buffer.from('ffffffffffffffff', 'hex');
var BLANK_OUTPUT = {
  script: EMPTY_SCRIPT,
  valueBuffer: VALUE_UINT64_MAX
};

Transaction.fromBuffer = function (buffer, __noStrict) {
  var offset = 0;
  function readSlice(n) {
    offset += n;
    return buffer.slice(offset - n, offset);
  }

  function readUInt32() {
    var i = buffer.readUInt32LE(offset);
    offset += 4;
    return i;
  }

  function readInt32() {
    var i = buffer.readInt32LE(offset);
    offset += 4;
    return i;
  }

  function readUInt64() {
    var i = bufferutils.readUInt64LE(buffer, offset);
    offset += 8;
    return i;
  }

  function readVarInt() {
    var vi = varuint.decode(buffer, offset);
    offset += varuint.decode.bytes;
    return vi;
  }

  function readVarSlice() {
    return readSlice(readVarInt());
  }

  function readVector() {
    var count = readVarInt();
    var vector = [];
    for (var i = 0; i < count; i++) {
      vector.push(readVarSlice());
    }return vector;
  }

  var tx = new Transaction();
  tx.version = readInt32();

  var marker = buffer.readUInt8(offset);
  var flag = buffer.readUInt8(offset + 1);

  var hasWitnesses = false;
  if (marker === Transaction.ADVANCED_TRANSACTION_MARKER && flag === Transaction.ADVANCED_TRANSACTION_FLAG) {
    offset += 2;
    hasWitnesses = true;
  }

  var vinLen = readVarInt();
  for (var i = 0; i < vinLen; ++i) {
    tx.ins.push({
      hash: readSlice(32),
      index: readUInt32(),
      script: readVarSlice(),
      sequence: readUInt32(),
      witness: EMPTY_WITNESS
    });
  }

  var voutLen = readVarInt();
  for (i = 0; i < voutLen; ++i) {
    tx.outs.push({
      value: readUInt64(),
      script: readVarSlice()
    });
  }

  if (hasWitnesses) {
    for (i = 0; i < vinLen; ++i) {
      tx.ins[i].witness = readVector();
    }

    // was this pointless?
    if (!tx.hasWitnesses()) throw new Error('Transaction has superfluous witness data');
  }

  tx.locktime = readUInt32();

  if (__noStrict) return tx;
  if (offset !== buffer.length) throw new Error('Transaction has unexpected data');

  return tx;
};

Transaction.fromHex = function (hex) {
  return Transaction.fromBuffer(Buffer.from(hex, 'hex'));
};

Transaction.isCoinbaseHash = function (buffer) {
  typeforce(types.Hash256bit, buffer);
  for (var i = 0; i < 32; ++i) {
    if (buffer[i] !== 0) return false;
  }
  return true;
};

Transaction.prototype.isCoinbase = function () {
  return this.ins.length === 1 && Transaction.isCoinbaseHash(this.ins[0].hash);
};

Transaction.prototype.addInput = function (hash, index, sequence, scriptSig) {
  typeforce(types.tuple(types.Hash256bit, types.UInt32, types.maybe(types.UInt32), types.maybe(types.Buffer)), arguments);

  if (types.Null(sequence)) {
    sequence = Transaction.DEFAULT_SEQUENCE;
  }

  // Add the input and return the input's index
  return this.ins.push({
    hash: hash,
    index: index,
    script: scriptSig || EMPTY_SCRIPT,
    sequence: sequence,
    witness: EMPTY_WITNESS
  }) - 1;
};

Transaction.prototype.addOutput = function (scriptPubKey, value) {
  typeforce(types.tuple(types.Buffer, types.Satoshi), arguments);

  // Add the output and return the output's index
  return this.outs.push({
    script: scriptPubKey,
    value: value
  }) - 1;
};

Transaction.prototype.hasWitnesses = function () {
  return this.ins.some(function (x) {
    return x.witness.length !== 0;
  });
};

Transaction.prototype.weight = function () {
  var base = this.__byteLength(false);
  var total = this.__byteLength(true);
  return base * 3 + total;
};

Transaction.prototype.virtualSize = function () {
  return Math.ceil(this.weight() / 4);
};

Transaction.prototype.byteLength = function () {
  return this.__byteLength(true);
};

Transaction.prototype.__byteLength = function (__allowWitness) {
  var hasWitnesses = __allowWitness && this.hasWitnesses();

  return (hasWitnesses ? 10 : 8) + varuint.encodingLength(this.ins.length) + varuint.encodingLength(this.outs.length) + this.ins.reduce(function (sum, input) {
    return sum + 40 + varSliceSize(input.script);
  }, 0) + this.outs.reduce(function (sum, output) {
    return sum + 8 + varSliceSize(output.script);
  }, 0) + (hasWitnesses ? this.ins.reduce(function (sum, input) {
    return sum + vectorSize(input.witness);
  }, 0) : 0);
};

Transaction.prototype.clone = function () {
  var newTx = new Transaction();
  newTx.version = this.version;
  newTx.locktime = this.locktime;

  newTx.ins = this.ins.map(function (txIn) {
    return {
      hash: txIn.hash,
      index: txIn.index,
      script: txIn.script,
      sequence: txIn.sequence,
      witness: txIn.witness
    };
  });

  newTx.outs = this.outs.map(function (txOut) {
    return {
      script: txOut.script,
      value: txOut.value
    };
  });

  return newTx;
};

/**
 * Hash transaction for signing a specific input.
 *
 * Bitcoin uses a different hash for each signed transaction input.
 * This method copies the transaction, makes the necessary changes based on the
 * hashType, and then hashes the result.
 * This hash can then be used to sign the provided transaction input.
 */
Transaction.prototype.hashForSignature = function (inIndex, prevOutScript, hashType) {
  typeforce(types.tuple(types.UInt32, types.Buffer, /* types.UInt8 */types.Number), arguments);

  // https://github.com/bitcoin/bitcoin/blob/master/src/test/sighash_tests.cpp#L29
  if (inIndex >= this.ins.length) return ONE;

  // ignore OP_CODESEPARATOR
  var ourScript = bscript.compile(bscript.decompile(prevOutScript).filter(function (x) {
    return x !== opcodes.OP_CODESEPARATOR;
  }));

  var txTmp = this.clone();

  // SIGHASH_NONE: ignore all outputs? (wildcard payee)
  if ((hashType & 0x1f) === Transaction.SIGHASH_NONE) {
    txTmp.outs = [];

    // ignore sequence numbers (except at inIndex)
    txTmp.ins.forEach(function (input, i) {
      if (i === inIndex) return;

      input.sequence = 0;
    });

    // SIGHASH_SINGLE: ignore all outputs, except at the same index?
  } else if ((hashType & 0x1f) === Transaction.SIGHASH_SINGLE) {
    // https://github.com/bitcoin/bitcoin/blob/master/src/test/sighash_tests.cpp#L60
    if (inIndex >= this.outs.length) return ONE;

    // truncate outputs after
    txTmp.outs.length = inIndex + 1;

    // "blank" outputs before
    for (var i = 0; i < inIndex; i++) {
      txTmp.outs[i] = BLANK_OUTPUT;
    }

    // ignore sequence numbers (except at inIndex)
    txTmp.ins.forEach(function (input, y) {
      if (y === inIndex) return;

      input.sequence = 0;
    });
  }

  // SIGHASH_ANYONECANPAY: ignore inputs entirely?
  if (hashType & Transaction.SIGHASH_ANYONECANPAY) {
    txTmp.ins = [txTmp.ins[inIndex]];
    txTmp.ins[0].script = ourScript;

    // SIGHASH_ALL: only ignore input scripts
  } else {
    // "blank" others input scripts
    txTmp.ins.forEach(function (input) {
      input.script = EMPTY_SCRIPT;
    });
    txTmp.ins[inIndex].script = ourScript;
  }

  // serialize and hash
  var buffer = Buffer.allocUnsafe(txTmp.__byteLength(false) + 4);
  buffer.writeInt32LE(hashType, buffer.length - 4);
  txTmp.__toBuffer(buffer, 0, false);

  return bcrypto.hash256(buffer);
};

Transaction.prototype.hashForWitnessV0 = function (inIndex, prevOutScript, value, hashType) {
  typeforce(types.tuple(types.UInt32, types.Buffer, types.Satoshi, types.UInt32), arguments);

  var tbuffer, toffset;
  function writeSlice(slice) {
    toffset += slice.copy(tbuffer, toffset);
  }
  function writeUInt32(i) {
    toffset = tbuffer.writeUInt32LE(i, toffset);
  }
  function writeUInt64(i) {
    toffset = bufferutils.writeUInt64LE(tbuffer, i, toffset);
  }
  function writeVarInt(i) {
    varuint.encode(i, tbuffer, toffset);
    toffset += varuint.encode.bytes;
  }
  function writeVarSlice(slice) {
    writeVarInt(slice.length);writeSlice(slice);
  }

  var hashOutputs = ZERO;
  var hashPrevouts = ZERO;
  var hashSequence = ZERO;

  if (!(hashType & Transaction.SIGHASH_ANYONECANPAY)) {
    tbuffer = Buffer.allocUnsafe(36 * this.ins.length);
    toffset = 0;

    this.ins.forEach(function (txIn) {
      writeSlice(txIn.hash);
      writeUInt32(txIn.index);
    });

    hashPrevouts = bcrypto.hash256(tbuffer);
  }

  if (!(hashType & Transaction.SIGHASH_ANYONECANPAY) && (hashType & 0x1f) !== Transaction.SIGHASH_SINGLE && (hashType & 0x1f) !== Transaction.SIGHASH_NONE) {
    tbuffer = Buffer.allocUnsafe(4 * this.ins.length);
    toffset = 0;

    this.ins.forEach(function (txIn) {
      writeUInt32(txIn.sequence);
    });

    hashSequence = bcrypto.hash256(tbuffer);
  }

  if ((hashType & 0x1f) !== Transaction.SIGHASH_SINGLE && (hashType & 0x1f) !== Transaction.SIGHASH_NONE) {
    var txOutsSize = this.outs.reduce(function (sum, output) {
      return sum + 8 + varSliceSize(output.script);
    }, 0);

    tbuffer = Buffer.allocUnsafe(txOutsSize);
    toffset = 0;

    this.outs.forEach(function (out) {
      writeUInt64(out.value);
      writeVarSlice(out.script);
    });

    hashOutputs = bcrypto.hash256(tbuffer);
  } else if ((hashType & 0x1f) === Transaction.SIGHASH_SINGLE && inIndex < this.outs.length) {
    var output = this.outs[inIndex];

    tbuffer = Buffer.allocUnsafe(8 + varSliceSize(output.script));
    toffset = 0;
    writeUInt64(output.value);
    writeVarSlice(output.script);

    hashOutputs = bcrypto.hash256(tbuffer);
  }

  tbuffer = Buffer.allocUnsafe(156 + varSliceSize(prevOutScript));
  toffset = 0;

  var input = this.ins[inIndex];
  writeUInt32(this.version);
  writeSlice(hashPrevouts);
  writeSlice(hashSequence);
  writeSlice(input.hash);
  writeUInt32(input.index);
  writeVarSlice(prevOutScript);
  writeUInt64(value);
  writeUInt32(input.sequence);
  writeSlice(hashOutputs);
  writeUInt32(this.locktime);
  writeUInt32(hashType);
  return bcrypto.hash256(tbuffer);
};

Transaction.prototype.getHash = function () {
  return bcrypto.hash256(this.__toBuffer(undefined, undefined, false));
};

Transaction.prototype.getId = function () {
  // transaction hash's are displayed in reverse order
  return this.getHash().reverse().toString('hex');
};

Transaction.prototype.toBuffer = function (buffer, initialOffset) {
  return this.__toBuffer(buffer, initialOffset, true);
};

Transaction.prototype.__toBuffer = function (buffer, initialOffset, __allowWitness) {
  if (!buffer) buffer = Buffer.allocUnsafe(this.__byteLength(__allowWitness));

  var offset = initialOffset || 0;
  function writeSlice(slice) {
    offset += slice.copy(buffer, offset);
  }
  function writeUInt8(i) {
    offset = buffer.writeUInt8(i, offset);
  }
  function writeUInt32(i) {
    offset = buffer.writeUInt32LE(i, offset);
  }
  function writeInt32(i) {
    offset = buffer.writeInt32LE(i, offset);
  }
  function writeUInt64(i) {
    offset = bufferutils.writeUInt64LE(buffer, i, offset);
  }
  function writeVarInt(i) {
    varuint.encode(i, buffer, offset);
    offset += varuint.encode.bytes;
  }
  function writeVarSlice(slice) {
    writeVarInt(slice.length);writeSlice(slice);
  }
  function writeVector(vector) {
    writeVarInt(vector.length);vector.forEach(writeVarSlice);
  }

  writeInt32(this.version);

  var hasWitnesses = __allowWitness && this.hasWitnesses();

  if (hasWitnesses) {
    writeUInt8(Transaction.ADVANCED_TRANSACTION_MARKER);
    writeUInt8(Transaction.ADVANCED_TRANSACTION_FLAG);
  }

  writeVarInt(this.ins.length);

  this.ins.forEach(function (txIn) {
    writeSlice(txIn.hash);
    writeUInt32(txIn.index);
    writeVarSlice(txIn.script);
    writeUInt32(txIn.sequence);
  });

  writeVarInt(this.outs.length);
  this.outs.forEach(function (txOut) {
    if (!txOut.valueBuffer) {
      writeUInt64(txOut.value);
    } else {
      writeSlice(txOut.valueBuffer);
    }

    writeVarSlice(txOut.script);
  });

  if (hasWitnesses) {
    this.ins.forEach(function (input) {
      writeVector(input.witness);
    });
  }

  writeUInt32(this.locktime);

  // avoid slicing unless necessary
  if (initialOffset !== undefined) return buffer.slice(initialOffset, offset);
  return buffer;
};

Transaction.prototype.toHex = function () {
  return this.toBuffer().toString('hex');
};

Transaction.prototype.setInputScript = function (index, scriptSig) {
  typeforce(types.tuple(types.Number, types.Buffer), arguments);

  this.ins[index].script = scriptSig;
};

Transaction.prototype.setWitness = function (index, witness) {
  typeforce(types.tuple(types.Number, [types.Buffer]), arguments);

  this.ins[index].witness = witness;
};

module.exports = Transaction;

},{"./bufferutils":82,"./crypto":83,"./script":90,"./types":116,"bitcoin-ops":41,"safe-buffer":591,"typeforce":605,"varuint-bitcoin":611}],115:[function(require,module,exports){
arguments[4][78][0].apply(exports,arguments)
},{"./address":80,"./crypto":83,"./ecpair":85,"./ecsignature":86,"./networks":89,"./script":90,"./templates":92,"./transaction":114,"./types":116,"bitcoin-ops":41,"dup":78,"safe-buffer":591,"typeforce":605}],116:[function(require,module,exports){
'use strict';

var typeforce = require('typeforce');

var UINT31_MAX = Math.pow(2, 31) - 1;
function UInt31(value) {
  return typeforce.UInt32(value) && value <= UINT31_MAX;
}

function BIP32Path(value) {
  return typeforce.String(value) && value.match(/^(m\/)?(\d+'?\/)*\d+'?$/);
}
BIP32Path.toJSON = function () {
  return 'BIP32 derivation path';
};

var SATOSHI_MAX = 21 * 1e14;
function Satoshi(value) {
  return typeforce.UInt53(value) && value <= SATOSHI_MAX;
}

// external dependent types
var BigInt = typeforce.quacksLike('BigInteger');
var ECPoint = typeforce.quacksLike('Point');

// exposed, external API
var ECSignature = typeforce.compile({ r: BigInt, s: BigInt });
var Network = typeforce.compile({
  messagePrefix: typeforce.oneOf(typeforce.Buffer, typeforce.String),
  bip32: {
    public: typeforce.UInt32,
    private: typeforce.UInt32
  },
  pubKeyHash: typeforce.UInt8,
  scriptHash: typeforce.UInt8,
  wif: typeforce.UInt8
});

// extend typeforce types with ours
var types = {
  BigInt: BigInt,
  BIP32Path: BIP32Path,
  Buffer256bit: typeforce.BufferN(32),
  ECPoint: ECPoint,
  ECSignature: ECSignature,
  Hash160bit: typeforce.BufferN(20),
  Hash256bit: typeforce.BufferN(32),
  Network: Network,
  Satoshi: Satoshi,
  UInt31: UInt31
};

for (var typeName in typeforce) {
  types[typeName] = typeforce[typeName];
}

module.exports = types;

},{"typeforce":605}],117:[function(require,module,exports){
"use strict";

},{}],118:[function(require,module,exports){
'use strict';

var basex = require('base-x');
var ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

module.exports = basex(ALPHABET);

},{"base-x":33}],119:[function(require,module,exports){
'use strict';

var base58 = require('bs58');
var Buffer = require('safe-buffer').Buffer;

module.exports = function (checksumFn) {
  // Encode a buffer as a base58-check encoded string
  function encode(payload) {
    var checksum = checksumFn(payload);

    return base58.encode(Buffer.concat([payload, checksum], payload.length + 4));
  }

  function decodeRaw(buffer) {
    var payload = buffer.slice(0, -4);
    var checksum = buffer.slice(-4);
    var newChecksum = checksumFn(payload);

    if (checksum[0] ^ newChecksum[0] | checksum[1] ^ newChecksum[1] | checksum[2] ^ newChecksum[2] | checksum[3] ^ newChecksum[3]) return;

    return payload;
  }

  // Decode a base58-check encoded string to a buffer, no result if checksum is wrong
  function decodeUnsafe(string) {
    var buffer = base58.decodeUnsafe(string);
    if (!buffer) return;

    return decodeRaw(buffer);
  }

  function decode(string) {
    var buffer = base58.decode(string);
    var payload = decodeRaw(buffer, checksumFn);
    if (!payload) throw new Error('Invalid checksum');
    return payload;
  }

  return {
    encode: encode,
    decode: decode,
    decodeUnsafe: decodeUnsafe
  };
};

},{"bs58":118,"safe-buffer":591}],120:[function(require,module,exports){
'use strict';

var createHash = require('create-hash');
var bs58checkBase = require('./base');

// SHA256(SHA256(buffer))
function sha256x2(buffer) {
  var tmp = createHash('sha256').update(buffer).digest();
  return createHash('sha256').update(tmp).digest();
}

module.exports = bs58checkBase(sha256x2);

},{"./base":119,"create-hash":553}],121:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict';

var base64 = require('base64-js');
var ieee754 = require('ieee754');

exports.Buffer = Buffer;
exports.SlowBuffer = SlowBuffer;
exports.INSPECT_MAX_BYTES = 50;

var K_MAX_LENGTH = 0x7fffffff;
exports.kMaxLength = K_MAX_LENGTH;

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport();

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' && typeof console.error === 'function') {
  console.error('This browser lacks typed array (Uint8Array) support which is required by ' + '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.');
}

function typedArraySupport() {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1);
    arr.__proto__ = { __proto__: Uint8Array.prototype, foo: function foo() {
        return 42;
      } };
    return arr.foo() === 42;
  } catch (e) {
    return false;
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  get: function get() {
    if (!(this instanceof Buffer)) {
      return undefined;
    }
    return this.buffer;
  }
});

Object.defineProperty(Buffer.prototype, 'offset', {
  get: function get() {
    if (!(this instanceof Buffer)) {
      return undefined;
    }
    return this.byteOffset;
  }
});

function createBuffer(length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('Invalid typed array length');
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length);
  buf.__proto__ = Buffer.prototype;
  return buf;
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer(arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error('If encoding is specified then the first argument must be a string');
    }
    return allocUnsafe(arg);
  }
  return from(arg, encodingOrOffset, length);
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species && Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  });
}

Buffer.poolSize = 8192; // not used by this implementation

function from(value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number');
  }

  if (isArrayBuffer(value) || value && isArrayBuffer(value.buffer)) {
    return fromArrayBuffer(value, encodingOrOffset, length);
  }

  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset);
  }

  return fromObject(value);
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length);
};

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype;
Buffer.__proto__ = Uint8Array;

function assertSize(size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number');
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative');
  }
}

function alloc(size, fill, encoding) {
  assertSize(size);
  if (size <= 0) {
    return createBuffer(size);
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string' ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
  }
  return createBuffer(size);
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding);
};

function allocUnsafe(size) {
  assertSize(size);
  return createBuffer(size < 0 ? 0 : checked(size) | 0);
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size);
};
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size);
};

function fromString(string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8';
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding);
  }

  var length = byteLength(string, encoding) | 0;
  var buf = createBuffer(length);

  var actual = buf.write(string, encoding);

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual);
  }

  return buf;
}

function fromArrayLike(array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0;
  var buf = createBuffer(length);
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255;
  }
  return buf;
}

function fromArrayBuffer(array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds');
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds');
  }

  var buf;
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array);
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset);
  } else {
    buf = new Uint8Array(array, byteOffset, length);
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype;
  return buf;
}

function fromObject(obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0;
    var buf = createBuffer(len);

    if (buf.length === 0) {
      return buf;
    }

    obj.copy(buf, 0, 0, len);
    return buf;
  }

  if (obj) {
    if (ArrayBuffer.isView(obj) || 'length' in obj) {
      if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
        return createBuffer(0);
      }
      return fromArrayLike(obj);
    }

    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return fromArrayLike(obj.data);
    }
  }

  throw new TypeError('The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object.');
}

function checked(length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' + 'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes');
  }
  return length | 0;
}

function SlowBuffer(length) {
  if (+length != length) {
    // eslint-disable-line eqeqeq
    length = 0;
  }
  return Buffer.alloc(+length);
}

Buffer.isBuffer = function isBuffer(b) {
  return b != null && b._isBuffer === true;
};

Buffer.compare = function compare(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers');
  }

  if (a === b) return 0;

  var x = a.length;
  var y = b.length;

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break;
    }
  }

  if (x < y) return -1;
  if (y < x) return 1;
  return 0;
};

Buffer.isEncoding = function isEncoding(encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true;
    default:
      return false;
  }
};

Buffer.concat = function concat(list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers');
  }

  if (list.length === 0) {
    return Buffer.alloc(0);
  }

  var i;
  if (length === undefined) {
    length = 0;
    for (i = 0; i < list.length; ++i) {
      length += list[i].length;
    }
  }

  var buffer = Buffer.allocUnsafe(length);
  var pos = 0;
  for (i = 0; i < list.length; ++i) {
    var buf = list[i];
    if (ArrayBuffer.isView(buf)) {
      buf = Buffer.from(buf);
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers');
    }
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer;
};

function byteLength(string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length;
  }
  if (ArrayBuffer.isView(string) || isArrayBuffer(string)) {
    return string.byteLength;
  }
  if (typeof string !== 'string') {
    string = '' + string;
  }

  var len = string.length;
  if (len === 0) return 0;

  // Use a for loop to avoid recursion
  var loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len;
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length;
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2;
      case 'hex':
        return len >>> 1;
      case 'base64':
        return base64ToBytes(string).length;
      default:
        if (loweredCase) return utf8ToBytes(string).length; // assume utf8
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
}
Buffer.byteLength = byteLength;

function slowToString(encoding, start, end) {
  var loweredCase = false;

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0;
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return '';
  }

  if (end === undefined || end > this.length) {
    end = this.length;
  }

  if (end <= 0) {
    return '';
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0;
  start >>>= 0;

  if (end <= start) {
    return '';
  }

  if (!encoding) encoding = 'utf8';

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end);

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end);

      case 'ascii':
        return asciiSlice(this, start, end);

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end);

      case 'base64':
        return base64Slice(this, start, end);

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end);

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding);
        encoding = (encoding + '').toLowerCase();
        loweredCase = true;
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true;

function swap(b, n, m) {
  var i = b[n];
  b[n] = b[m];
  b[m] = i;
}

Buffer.prototype.swap16 = function swap16() {
  var len = this.length;
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits');
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1);
  }
  return this;
};

Buffer.prototype.swap32 = function swap32() {
  var len = this.length;
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits');
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3);
    swap(this, i + 1, i + 2);
  }
  return this;
};

Buffer.prototype.swap64 = function swap64() {
  var len = this.length;
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits');
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7);
    swap(this, i + 1, i + 6);
    swap(this, i + 2, i + 5);
    swap(this, i + 3, i + 4);
  }
  return this;
};

Buffer.prototype.toString = function toString() {
  var length = this.length;
  if (length === 0) return '';
  if (arguments.length === 0) return utf8Slice(this, 0, length);
  return slowToString.apply(this, arguments);
};

Buffer.prototype.toLocaleString = Buffer.prototype.toString;

Buffer.prototype.equals = function equals(b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer');
  if (this === b) return true;
  return Buffer.compare(this, b) === 0;
};

Buffer.prototype.inspect = function inspect() {
  var str = '';
  var max = exports.INSPECT_MAX_BYTES;
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ');
    if (this.length > max) str += ' ... ';
  }
  return '<Buffer ' + str + '>';
};

Buffer.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
  if (!Buffer.isBuffer(target)) {
    throw new TypeError('Argument must be a Buffer');
  }

  if (start === undefined) {
    start = 0;
  }
  if (end === undefined) {
    end = target ? target.length : 0;
  }
  if (thisStart === undefined) {
    thisStart = 0;
  }
  if (thisEnd === undefined) {
    thisEnd = this.length;
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index');
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0;
  }
  if (thisStart >= thisEnd) {
    return -1;
  }
  if (start >= end) {
    return 1;
  }

  start >>>= 0;
  end >>>= 0;
  thisStart >>>= 0;
  thisEnd >>>= 0;

  if (this === target) return 0;

  var x = thisEnd - thisStart;
  var y = end - start;
  var len = Math.min(x, y);

  var thisCopy = this.slice(thisStart, thisEnd);
  var targetCopy = target.slice(start, end);

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i];
      y = targetCopy[i];
      break;
    }
  }

  if (x < y) return -1;
  if (y < x) return 1;
  return 0;
};

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1;

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset;
    byteOffset = 0;
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff;
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000;
  }
  byteOffset = +byteOffset; // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : buffer.length - 1;
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
  if (byteOffset >= buffer.length) {
    if (dir) return -1;else byteOffset = buffer.length - 1;
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0;else return -1;
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding);
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1;
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
  } else if (typeof val === 'number') {
    val = val & 0xFF; // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
      }
    }
    return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
  }

  throw new TypeError('val must be string, number or Buffer');
}

function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
  var indexSize = 1;
  var arrLength = arr.length;
  var valLength = val.length;

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase();
    if (encoding === 'ucs2' || encoding === 'ucs-2' || encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1;
      }
      indexSize = 2;
      arrLength /= 2;
      valLength /= 2;
      byteOffset /= 2;
    }
  }

  function read(buf, i) {
    if (indexSize === 1) {
      return buf[i];
    } else {
      return buf.readUInt16BE(i * indexSize);
    }
  }

  var i;
  if (dir) {
    var foundIndex = -1;
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i;
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
      } else {
        if (foundIndex !== -1) i -= i - foundIndex;
        foundIndex = -1;
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
    for (i = byteOffset; i >= 0; i--) {
      var found = true;
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
  }

  return -1;
}

Buffer.prototype.includes = function includes(val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1;
};

Buffer.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
};

Buffer.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
};

function hexWrite(buf, string, offset, length) {
  offset = Number(offset) || 0;
  var remaining = buf.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = Number(length);
    if (length > remaining) {
      length = remaining;
    }
  }

  var strLen = string.length;

  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16);
    if (numberIsNaN(parsed)) return i;
    buf[offset + i] = parsed;
  }
  return i;
}

function utf8Write(buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
}

function asciiWrite(buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length);
}

function latin1Write(buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length);
}

function base64Write(buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length);
}

function ucs2Write(buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
}

Buffer.prototype.write = function write(string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8';
    length = this.length;
    offset = 0;
    // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset;
    length = this.length;
    offset = 0;
    // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0;
    if (isFinite(length)) {
      length = length >>> 0;
      if (encoding === undefined) encoding = 'utf8';
    } else {
      encoding = length;
      length = undefined;
    }
  } else {
    throw new Error('Buffer.write(string, encoding, offset[, length]) is no longer supported');
  }

  var remaining = this.length - offset;
  if (length === undefined || length > remaining) length = remaining;

  if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds');
  }

  if (!encoding) encoding = 'utf8';

  var loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length);

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length);

      case 'ascii':
        return asciiWrite(this, string, offset, length);

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length);

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length);

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length);

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding);
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
};

Buffer.prototype.toJSON = function toJSON() {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  };
};

function base64Slice(buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf);
  } else {
    return base64.fromByteArray(buf.slice(start, end));
  }
}

function utf8Slice(buf, start, end) {
  end = Math.min(buf.length, end);
  var res = [];

  var i = start;
  while (i < end) {
    var firstByte = buf[i];
    var codePoint = null;
    var bytesPerSequence = firstByte > 0xEF ? 4 : firstByte > 0xDF ? 3 : firstByte > 0xBF ? 2 : 1;

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint;

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte;
          }
          break;
        case 2:
          secondByte = buf[i + 1];
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | secondByte & 0x3F;
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint;
            }
          }
          break;
        case 3:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | thirdByte & 0x3F;
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint;
            }
          }
          break;
        case 4:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          fourthByte = buf[i + 3];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | fourthByte & 0x3F;
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint;
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD;
      bytesPerSequence = 1;
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000;
      res.push(codePoint >>> 10 & 0x3FF | 0xD800);
      codePoint = 0xDC00 | codePoint & 0x3FF;
    }

    res.push(codePoint);
    i += bytesPerSequence;
  }

  return decodeCodePointsArray(res);
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000;

function decodeCodePointsArray(codePoints) {
  var len = codePoints.length;
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints); // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = '';
  var i = 0;
  while (i < len) {
    res += String.fromCharCode.apply(String, codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH));
  }
  return res;
}

function asciiSlice(buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F);
  }
  return ret;
}

function latin1Slice(buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i]);
  }
  return ret;
}

function hexSlice(buf, start, end) {
  var len = buf.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i]);
  }
  return out;
}

function utf16leSlice(buf, start, end) {
  var bytes = buf.slice(start, end);
  var res = '';
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
  }
  return res;
}

Buffer.prototype.slice = function slice(start, end) {
  var len = this.length;
  start = ~~start;
  end = end === undefined ? len : ~~end;

  if (start < 0) {
    start += len;
    if (start < 0) start = 0;
  } else if (start > len) {
    start = len;
  }

  if (end < 0) {
    end += len;
    if (end < 0) end = 0;
  } else if (end > len) {
    end = len;
  }

  if (end < start) end = start;

  var newBuf = this.subarray(start, end);
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype;
  return newBuf;
};

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset(offset, ext, length) {
  if (offset % 1 !== 0 || offset < 0) throw new RangeError('offset is not uint');
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length');
}

Buffer.prototype.readUIntLE = function readUIntLE(offset, byteLength, noAssert) {
  offset = offset >>> 0;
  byteLength = byteLength >>> 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }

  return val;
};

Buffer.prototype.readUIntBE = function readUIntBE(offset, byteLength, noAssert) {
  offset = offset >>> 0;
  byteLength = byteLength >>> 0;
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length);
  }

  var val = this[offset + --byteLength];
  var mul = 1;
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul;
  }

  return val;
};

Buffer.prototype.readUInt8 = function readUInt8(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 1, this.length);
  return this[offset];
};

Buffer.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 2, this.length);
  return this[offset] | this[offset + 1] << 8;
};

Buffer.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 2, this.length);
  return this[offset] << 8 | this[offset + 1];
};

Buffer.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 0x1000000;
};

Buffer.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);

  return this[offset] * 0x1000000 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
};

Buffer.prototype.readIntLE = function readIntLE(offset, byteLength, noAssert) {
  offset = offset >>> 0;
  byteLength = byteLength >>> 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }
  mul *= 0x80;

  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

  return val;
};

Buffer.prototype.readIntBE = function readIntBE(offset, byteLength, noAssert) {
  offset = offset >>> 0;
  byteLength = byteLength >>> 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var i = byteLength;
  var mul = 1;
  var val = this[offset + --i];
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul;
  }
  mul *= 0x80;

  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

  return val;
};

Buffer.prototype.readInt8 = function readInt8(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 1, this.length);
  if (!(this[offset] & 0x80)) return this[offset];
  return (0xff - this[offset] + 1) * -1;
};

Buffer.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset] | this[offset + 1] << 8;
  return val & 0x8000 ? val | 0xFFFF0000 : val;
};

Buffer.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset + 1] | this[offset] << 8;
  return val & 0x8000 ? val | 0xFFFF0000 : val;
};

Buffer.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);

  return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
};

Buffer.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);

  return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
};

Buffer.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);
  return ieee754.read(this, offset, true, 23, 4);
};

Buffer.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);
  return ieee754.read(this, offset, false, 23, 4);
};

Buffer.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 8, this.length);
  return ieee754.read(this, offset, true, 52, 8);
};

Buffer.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 8, this.length);
  return ieee754.read(this, offset, false, 52, 8);
};

function checkInt(buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
  if (offset + ext > buf.length) throw new RangeError('Index out of range');
}

Buffer.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset >>> 0;
  byteLength = byteLength >>> 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }

  var mul = 1;
  var i = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = value / mul & 0xFF;
  }

  return offset + byteLength;
};

Buffer.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset >>> 0;
  byteLength = byteLength >>> 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }

  var i = byteLength - 1;
  var mul = 1;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = value / mul & 0xFF;
  }

  return offset + byteLength;
};

Buffer.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
  this[offset] = value & 0xff;
  return offset + 1;
};

Buffer.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  this[offset] = value & 0xff;
  this[offset + 1] = value >>> 8;
  return offset + 2;
};

Buffer.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  this[offset] = value >>> 8;
  this[offset + 1] = value & 0xff;
  return offset + 2;
};

Buffer.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  this[offset + 3] = value >>> 24;
  this[offset + 2] = value >>> 16;
  this[offset + 1] = value >>> 8;
  this[offset] = value & 0xff;
  return offset + 4;
};

Buffer.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  this[offset] = value >>> 24;
  this[offset + 1] = value >>> 16;
  this[offset + 2] = value >>> 8;
  this[offset + 3] = value & 0xff;
  return offset + 4;
};

Buffer.prototype.writeIntLE = function writeIntLE(value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);

    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }

  var i = 0;
  var mul = 1;
  var sub = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = (value / mul >> 0) - sub & 0xFF;
  }

  return offset + byteLength;
};

Buffer.prototype.writeIntBE = function writeIntBE(value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);

    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }

  var i = byteLength - 1;
  var mul = 1;
  var sub = 0;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = (value / mul >> 0) - sub & 0xFF;
  }

  return offset + byteLength;
};

Buffer.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80);
  if (value < 0) value = 0xff + value + 1;
  this[offset] = value & 0xff;
  return offset + 1;
};

Buffer.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
  this[offset] = value & 0xff;
  this[offset + 1] = value >>> 8;
  return offset + 2;
};

Buffer.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
  this[offset] = value >>> 8;
  this[offset + 1] = value & 0xff;
  return offset + 2;
};

Buffer.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
  this[offset] = value & 0xff;
  this[offset + 1] = value >>> 8;
  this[offset + 2] = value >>> 16;
  this[offset + 3] = value >>> 24;
  return offset + 4;
};

Buffer.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
  if (value < 0) value = 0xffffffff + value + 1;
  this[offset] = value >>> 24;
  this[offset + 1] = value >>> 16;
  this[offset + 2] = value >>> 8;
  this[offset + 3] = value & 0xff;
  return offset + 4;
};

function checkIEEE754(buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range');
  if (offset < 0) throw new RangeError('Index out of range');
}

function writeFloat(buf, value, offset, littleEndian, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38);
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4);
  return offset + 4;
}

Buffer.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert);
};

Buffer.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert);
};

function writeDouble(buf, value, offset, littleEndian, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308);
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8);
  return offset + 8;
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert);
};

Buffer.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert);
};

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy(target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer');
  if (!start) start = 0;
  if (!end && end !== 0) end = this.length;
  if (targetStart >= target.length) targetStart = target.length;
  if (!targetStart) targetStart = 0;
  if (end > 0 && end < start) end = start;

  // Copy 0 bytes; we're done
  if (end === start) return 0;
  if (target.length === 0 || this.length === 0) return 0;

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds');
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range');
  if (end < 0) throw new RangeError('sourceEnd out of bounds');

  // Are we oob?
  if (end > this.length) end = this.length;
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start;
  }

  var len = end - start;

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end);
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start];
    }
  } else {
    Uint8Array.prototype.set.call(target, this.subarray(start, end), targetStart);
  }

  return len;
};

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill(val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start;
      start = 0;
      end = this.length;
    } else if (typeof end === 'string') {
      encoding = end;
      end = this.length;
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string');
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding);
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0);
      if (encoding === 'utf8' && code < 128 || encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code;
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255;
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index');
  }

  if (end <= start) {
    return this;
  }

  start = start >>> 0;
  end = end === undefined ? this.length : end >>> 0;

  if (!val) val = 0;

  var i;
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val;
    }
  } else {
    var bytes = Buffer.isBuffer(val) ? val : new Buffer(val, encoding);
    var len = bytes.length;
    if (len === 0) {
      throw new TypeError('The value "' + val + '" is invalid for argument "value"');
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len];
    }
  }

  return this;
};

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;

function base64clean(str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0];
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '');
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return '';
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '=';
  }
  return str;
}

function toHex(n) {
  if (n < 16) return '0' + n.toString(16);
  return n.toString(16);
}

function utf8ToBytes(string, units) {
  units = units || Infinity;
  var codePoint;
  var length = string.length;
  var leadSurrogate = null;
  var bytes = [];

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i);

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue;
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue;
        }

        // valid lead
        leadSurrogate = codePoint;

        continue;
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
        leadSurrogate = codePoint;
        continue;
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
    }

    leadSurrogate = null;

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break;
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break;
      bytes.push(codePoint >> 0x6 | 0xC0, codePoint & 0x3F | 0x80);
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break;
      bytes.push(codePoint >> 0xC | 0xE0, codePoint >> 0x6 & 0x3F | 0x80, codePoint & 0x3F | 0x80);
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break;
      bytes.push(codePoint >> 0x12 | 0xF0, codePoint >> 0xC & 0x3F | 0x80, codePoint >> 0x6 & 0x3F | 0x80, codePoint & 0x3F | 0x80);
    } else {
      throw new Error('Invalid code point');
    }
  }

  return bytes;
}

function asciiToBytes(str) {
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF);
  }
  return byteArray;
}

function utf16leToBytes(str, units) {
  var c, hi, lo;
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break;

    c = str.charCodeAt(i);
    hi = c >> 8;
    lo = c % 256;
    byteArray.push(lo);
    byteArray.push(hi);
  }

  return byteArray;
}

function base64ToBytes(str) {
  return base64.toByteArray(base64clean(str));
}

function blitBuffer(src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if (i + offset >= dst.length || i >= src.length) break;
    dst[i + offset] = src[i];
  }
  return i;
}

// ArrayBuffers from another context (i.e. an iframe) do not pass the `instanceof` check
// but they should be treated as valid. See: https://github.com/feross/buffer/issues/166
function isArrayBuffer(obj) {
  return obj instanceof ArrayBuffer || obj != null && obj.constructor != null && obj.constructor.name === 'ArrayBuffer' && typeof obj.byteLength === 'number';
}

function numberIsNaN(obj) {
  return obj !== obj; // eslint-disable-line no-self-compare
}

},{"base64-js":34,"ieee754":564}],122:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var Transform = require('stream').Transform;
var StringDecoder = require('string_decoder').StringDecoder;
var inherits = require('inherits');

function CipherBase(hashMode) {
  Transform.call(this);
  this.hashMode = typeof hashMode === 'string';
  if (this.hashMode) {
    this[hashMode] = this._finalOrDigest;
  } else {
    this.final = this._finalOrDigest;
  }
  if (this._final) {
    this.__final = this._final;
    this._final = null;
  }
  this._decoder = null;
  this._encoding = null;
}
inherits(CipherBase, Transform);

CipherBase.prototype.update = function (data, inputEnc, outputEnc) {
  if (typeof data === 'string') {
    data = Buffer.from(data, inputEnc);
  }

  var outData = this._update(data);
  if (this.hashMode) return this;

  if (outputEnc) {
    outData = this._toString(outData, outputEnc);
  }

  return outData;
};

CipherBase.prototype.setAutoPadding = function () {};
CipherBase.prototype.getAuthTag = function () {
  throw new Error('trying to get auth tag in unsupported state');
};

CipherBase.prototype.setAuthTag = function () {
  throw new Error('trying to set auth tag in unsupported state');
};

CipherBase.prototype.setAAD = function () {
  throw new Error('trying to set aad in unsupported state');
};

CipherBase.prototype._transform = function (data, _, next) {
  var err;
  try {
    if (this.hashMode) {
      this._update(data);
    } else {
      this.push(this._update(data));
    }
  } catch (e) {
    err = e;
  } finally {
    next(err);
  }
};
CipherBase.prototype._flush = function (done) {
  var err;
  try {
    this.push(this.__final());
  } catch (e) {
    err = e;
  }

  done(err);
};
CipherBase.prototype._finalOrDigest = function (outputEnc) {
  var outData = this.__final() || Buffer.alloc(0);
  if (outputEnc) {
    outData = this._toString(outData, outputEnc, true);
  }
  return outData;
};

CipherBase.prototype._toString = function (value, enc, fin) {
  if (!this._decoder) {
    this._decoder = new StringDecoder(enc);
    this._encoding = enc;
  }

  if (this._encoding !== enc) throw new Error('can\'t switch encodings');

  var out = this._decoder.write(value);
  if (fin) {
    out += this._decoder.end();
  }

  return out;
};

module.exports = CipherBase;

},{"inherits":565,"safe-buffer":591,"stream":600,"string_decoder":601}],123:[function(require,module,exports){
'use strict';

require('../../modules/core.regexp.escape');
module.exports = require('../../modules/_core').RegExp.escape;

},{"../../modules/_core":249,"../../modules/core.regexp.escape":354}],124:[function(require,module,exports){
'use strict';

require('../../modules/es6.string.iterator');
require('../../modules/es6.array.from');
module.exports = require('../../modules/_core').Array.from;

},{"../../modules/_core":142,"../../modules/es6.array.from":212,"../../modules/es6.string.iterator":222}],125:[function(require,module,exports){
'use strict';

require('../modules/web.dom.iterable');
require('../modules/es6.string.iterator');
module.exports = require('../modules/core.get-iterator');

},{"../modules/core.get-iterator":211,"../modules/es6.string.iterator":222,"../modules/web.dom.iterable":228}],126:[function(require,module,exports){
'use strict';

require('../../modules/es6.object.assign');
module.exports = require('../../modules/_core').Object.assign;

},{"../../modules/_core":142,"../../modules/es6.object.assign":214}],127:[function(require,module,exports){
'use strict';

require('../../modules/es6.object.create');
var $Object = require('../../modules/_core').Object;
module.exports = function create(P, D) {
  return $Object.create(P, D);
};

},{"../../modules/_core":142,"../../modules/es6.object.create":215}],128:[function(require,module,exports){
'use strict';

require('../../modules/es6.object.define-property');
var $Object = require('../../modules/_core').Object;
module.exports = function defineProperty(it, key, desc) {
  return $Object.defineProperty(it, key, desc);
};

},{"../../modules/_core":142,"../../modules/es6.object.define-property":216}],129:[function(require,module,exports){
'use strict';

require('../../modules/es6.object.get-prototype-of');
module.exports = require('../../modules/_core').Object.getPrototypeOf;

},{"../../modules/_core":142,"../../modules/es6.object.get-prototype-of":217}],130:[function(require,module,exports){
'use strict';

require('../../modules/es6.object.keys');
module.exports = require('../../modules/_core').Object.keys;

},{"../../modules/_core":142,"../../modules/es6.object.keys":218}],131:[function(require,module,exports){
'use strict';

require('../../modules/es6.object.set-prototype-of');
module.exports = require('../../modules/_core').Object.setPrototypeOf;

},{"../../modules/_core":142,"../../modules/es6.object.set-prototype-of":219}],132:[function(require,module,exports){
'use strict';

require('../modules/es6.object.to-string');
require('../modules/es6.string.iterator');
require('../modules/web.dom.iterable');
require('../modules/es6.promise');
require('../modules/es7.promise.finally');
require('../modules/es7.promise.try');
module.exports = require('../modules/_core').Promise;

},{"../modules/_core":142,"../modules/es6.object.to-string":220,"../modules/es6.promise":221,"../modules/es6.string.iterator":222,"../modules/es7.promise.finally":224,"../modules/es7.promise.try":225,"../modules/web.dom.iterable":228}],133:[function(require,module,exports){
'use strict';

require('../../modules/es6.symbol');
require('../../modules/es6.object.to-string');
require('../../modules/es7.symbol.async-iterator');
require('../../modules/es7.symbol.observable');
module.exports = require('../../modules/_core').Symbol;

},{"../../modules/_core":142,"../../modules/es6.object.to-string":220,"../../modules/es6.symbol":223,"../../modules/es7.symbol.async-iterator":226,"../../modules/es7.symbol.observable":227}],134:[function(require,module,exports){
'use strict';

require('../../modules/es6.string.iterator');
require('../../modules/web.dom.iterable');
module.exports = require('../../modules/_wks-ext').f('iterator');

},{"../../modules/_wks-ext":208,"../../modules/es6.string.iterator":222,"../../modules/web.dom.iterable":228}],135:[function(require,module,exports){
'use strict';

module.exports = function (it) {
  if (typeof it != 'function') throw TypeError(it + ' is not a function!');
  return it;
};

},{}],136:[function(require,module,exports){
"use strict";

module.exports = function () {/* empty */};

},{}],137:[function(require,module,exports){
'use strict';

module.exports = function (it, Constructor, name, forbiddenField) {
  if (!(it instanceof Constructor) || forbiddenField !== undefined && forbiddenField in it) {
    throw TypeError(name + ': incorrect invocation!');
  }return it;
};

},{}],138:[function(require,module,exports){
'use strict';

var isObject = require('./_is-object');
module.exports = function (it) {
  if (!isObject(it)) throw TypeError(it + ' is not an object!');
  return it;
};

},{"./_is-object":162}],139:[function(require,module,exports){
'use strict';

// false -> Array#indexOf
// true  -> Array#includes
var toIObject = require('./_to-iobject');
var toLength = require('./_to-length');
var toAbsoluteIndex = require('./_to-absolute-index');
module.exports = function (IS_INCLUDES) {
  return function ($this, el, fromIndex) {
    var O = toIObject($this);
    var length = toLength(O.length);
    var index = toAbsoluteIndex(fromIndex, length);
    var value;
    // Array#includes uses SameValueZero equality algorithm
    // eslint-disable-next-line no-self-compare
    if (IS_INCLUDES && el != el) while (length > index) {
      value = O[index++];
      // eslint-disable-next-line no-self-compare
      if (value != value) return true;
      // Array#indexOf ignores holes, Array#includes - not
    } else for (; length > index; index++) {
      if (IS_INCLUDES || index in O) {
        if (O[index] === el) return IS_INCLUDES || index || 0;
      }
    }return !IS_INCLUDES && -1;
  };
};

},{"./_to-absolute-index":199,"./_to-iobject":201,"./_to-length":202}],140:[function(require,module,exports){
'use strict';

// getting tag from 19.1.3.6 Object.prototype.toString()
var cof = require('./_cof');
var TAG = require('./_wks')('toStringTag');
// ES3 wrong here
var ARG = cof(function () {
  return arguments;
}()) == 'Arguments';

// fallback for IE11 Script Access Denied error
var tryGet = function tryGet(it, key) {
  try {
    return it[key];
  } catch (e) {/* empty */}
};

module.exports = function (it) {
  var O, T, B;
  return it === undefined ? 'Undefined' : it === null ? 'Null'
  // @@toStringTag case
  : typeof (T = tryGet(O = Object(it), TAG)) == 'string' ? T
  // builtinTag case
  : ARG ? cof(O)
  // ES3 arguments fallback
  : (B = cof(O)) == 'Object' && typeof O.callee == 'function' ? 'Arguments' : B;
};

},{"./_cof":141,"./_wks":209}],141:[function(require,module,exports){
"use strict";

var toString = {}.toString;

module.exports = function (it) {
  return toString.call(it).slice(8, -1);
};

},{}],142:[function(require,module,exports){
'use strict';

var core = module.exports = { version: '2.5.7' };
if (typeof __e == 'number') __e = core; // eslint-disable-line no-undef

},{}],143:[function(require,module,exports){
'use strict';

var $defineProperty = require('./_object-dp');
var createDesc = require('./_property-desc');

module.exports = function (object, index, value) {
  if (index in object) $defineProperty.f(object, index, createDesc(0, value));else object[index] = value;
};

},{"./_object-dp":175,"./_property-desc":188}],144:[function(require,module,exports){
'use strict';

// optional / simple context binding
var aFunction = require('./_a-function');
module.exports = function (fn, that, length) {
  aFunction(fn);
  if (that === undefined) return fn;
  switch (length) {
    case 1:
      return function (a) {
        return fn.call(that, a);
      };
    case 2:
      return function (a, b) {
        return fn.call(that, a, b);
      };
    case 3:
      return function (a, b, c) {
        return fn.call(that, a, b, c);
      };
  }
  return function () /* ...args */{
    return fn.apply(that, arguments);
  };
};

},{"./_a-function":135}],145:[function(require,module,exports){
"use strict";

// 7.2.1 RequireObjectCoercible(argument)
module.exports = function (it) {
  if (it == undefined) throw TypeError("Can't call method on  " + it);
  return it;
};

},{}],146:[function(require,module,exports){
'use strict';

// Thank's IE8 for his funny defineProperty
module.exports = !require('./_fails')(function () {
  return Object.defineProperty({}, 'a', { get: function get() {
      return 7;
    } }).a != 7;
});

},{"./_fails":151}],147:[function(require,module,exports){
'use strict';

var isObject = require('./_is-object');
var document = require('./_global').document;
// typeof document.createElement is 'object' in old IE
var is = isObject(document) && isObject(document.createElement);
module.exports = function (it) {
  return is ? document.createElement(it) : {};
};

},{"./_global":153,"./_is-object":162}],148:[function(require,module,exports){
'use strict';

// IE 8- don't enum bug keys
module.exports = 'constructor,hasOwnProperty,isPrototypeOf,propertyIsEnumerable,toLocaleString,toString,valueOf'.split(',');

},{}],149:[function(require,module,exports){
'use strict';

// all enumerable object keys, includes symbols
var getKeys = require('./_object-keys');
var gOPS = require('./_object-gops');
var pIE = require('./_object-pie');
module.exports = function (it) {
  var result = getKeys(it);
  var getSymbols = gOPS.f;
  if (getSymbols) {
    var symbols = getSymbols(it);
    var isEnum = pIE.f;
    var i = 0;
    var key;
    while (symbols.length > i) {
      if (isEnum.call(it, key = symbols[i++])) result.push(key);
    }
  }return result;
};

},{"./_object-gops":180,"./_object-keys":183,"./_object-pie":184}],150:[function(require,module,exports){
'use strict';

var global = require('./_global');
var core = require('./_core');
var ctx = require('./_ctx');
var hide = require('./_hide');
var has = require('./_has');
var PROTOTYPE = 'prototype';

var $export = function $export(type, name, source) {
  var IS_FORCED = type & $export.F;
  var IS_GLOBAL = type & $export.G;
  var IS_STATIC = type & $export.S;
  var IS_PROTO = type & $export.P;
  var IS_BIND = type & $export.B;
  var IS_WRAP = type & $export.W;
  var exports = IS_GLOBAL ? core : core[name] || (core[name] = {});
  var expProto = exports[PROTOTYPE];
  var target = IS_GLOBAL ? global : IS_STATIC ? global[name] : (global[name] || {})[PROTOTYPE];
  var key, own, out;
  if (IS_GLOBAL) source = name;
  for (key in source) {
    // contains in native
    own = !IS_FORCED && target && target[key] !== undefined;
    if (own && has(exports, key)) continue;
    // export native or passed
    out = own ? target[key] : source[key];
    // prevent global pollution for namespaces
    exports[key] = IS_GLOBAL && typeof target[key] != 'function' ? source[key]
    // bind timers to global for call from export context
    : IS_BIND && own ? ctx(out, global)
    // wrap global constructors for prevent change them in library
    : IS_WRAP && target[key] == out ? function (C) {
      var F = function F(a, b, c) {
        if (this instanceof C) {
          switch (arguments.length) {
            case 0:
              return new C();
            case 1:
              return new C(a);
            case 2:
              return new C(a, b);
          }return new C(a, b, c);
        }return C.apply(this, arguments);
      };
      F[PROTOTYPE] = C[PROTOTYPE];
      return F;
      // make static versions for prototype methods
    }(out) : IS_PROTO && typeof out == 'function' ? ctx(Function.call, out) : out;
    // export proto methods to core.%CONSTRUCTOR%.methods.%NAME%
    if (IS_PROTO) {
      (exports.virtual || (exports.virtual = {}))[key] = out;
      // export proto methods to core.%CONSTRUCTOR%.prototype.%NAME%
      if (type & $export.R && expProto && !expProto[key]) hide(expProto, key, out);
    }
  }
};
// type bitmap
$export.F = 1; // forced
$export.G = 2; // global
$export.S = 4; // static
$export.P = 8; // proto
$export.B = 16; // bind
$export.W = 32; // wrap
$export.U = 64; // safe
$export.R = 128; // real proto method for `library`
module.exports = $export;

},{"./_core":142,"./_ctx":144,"./_global":153,"./_has":154,"./_hide":155}],151:[function(require,module,exports){
"use strict";

module.exports = function (exec) {
  try {
    return !!exec();
  } catch (e) {
    return true;
  }
};

},{}],152:[function(require,module,exports){
'use strict';

var ctx = require('./_ctx');
var call = require('./_iter-call');
var isArrayIter = require('./_is-array-iter');
var anObject = require('./_an-object');
var toLength = require('./_to-length');
var getIterFn = require('./core.get-iterator-method');
var BREAK = {};
var RETURN = {};
var _exports = module.exports = function (iterable, entries, fn, that, ITERATOR) {
  var iterFn = ITERATOR ? function () {
    return iterable;
  } : getIterFn(iterable);
  var f = ctx(fn, that, entries ? 2 : 1);
  var index = 0;
  var length, step, iterator, result;
  if (typeof iterFn != 'function') throw TypeError(iterable + ' is not iterable!');
  // fast case for arrays with default iterator
  if (isArrayIter(iterFn)) for (length = toLength(iterable.length); length > index; index++) {
    result = entries ? f(anObject(step = iterable[index])[0], step[1]) : f(iterable[index]);
    if (result === BREAK || result === RETURN) return result;
  } else for (iterator = iterFn.call(iterable); !(step = iterator.next()).done;) {
    result = call(iterator, f, step.value, entries);
    if (result === BREAK || result === RETURN) return result;
  }
};
_exports.BREAK = BREAK;
_exports.RETURN = RETURN;

},{"./_an-object":138,"./_ctx":144,"./_is-array-iter":160,"./_iter-call":163,"./_to-length":202,"./core.get-iterator-method":210}],153:[function(require,module,exports){
'use strict';

// https://github.com/zloirock/core-js/issues/86#issuecomment-115759028
var global = module.exports = typeof window != 'undefined' && window.Math == Math ? window : typeof self != 'undefined' && self.Math == Math ? self
// eslint-disable-next-line no-new-func
: Function('return this')();
if (typeof __g == 'number') __g = global; // eslint-disable-line no-undef

},{}],154:[function(require,module,exports){
"use strict";

var hasOwnProperty = {}.hasOwnProperty;
module.exports = function (it, key) {
  return hasOwnProperty.call(it, key);
};

},{}],155:[function(require,module,exports){
'use strict';

var dP = require('./_object-dp');
var createDesc = require('./_property-desc');
module.exports = require('./_descriptors') ? function (object, key, value) {
  return dP.f(object, key, createDesc(1, value));
} : function (object, key, value) {
  object[key] = value;
  return object;
};

},{"./_descriptors":146,"./_object-dp":175,"./_property-desc":188}],156:[function(require,module,exports){
'use strict';

var document = require('./_global').document;
module.exports = document && document.documentElement;

},{"./_global":153}],157:[function(require,module,exports){
'use strict';

module.exports = !require('./_descriptors') && !require('./_fails')(function () {
  return Object.defineProperty(require('./_dom-create')('div'), 'a', { get: function get() {
      return 7;
    } }).a != 7;
});

},{"./_descriptors":146,"./_dom-create":147,"./_fails":151}],158:[function(require,module,exports){
"use strict";

// fast apply, http://jsperf.lnkit.com/fast-apply/5
module.exports = function (fn, args, that) {
                  var un = that === undefined;
                  switch (args.length) {
                                    case 0:
                                                      return un ? fn() : fn.call(that);
                                    case 1:
                                                      return un ? fn(args[0]) : fn.call(that, args[0]);
                                    case 2:
                                                      return un ? fn(args[0], args[1]) : fn.call(that, args[0], args[1]);
                                    case 3:
                                                      return un ? fn(args[0], args[1], args[2]) : fn.call(that, args[0], args[1], args[2]);
                                    case 4:
                                                      return un ? fn(args[0], args[1], args[2], args[3]) : fn.call(that, args[0], args[1], args[2], args[3]);
                  }return fn.apply(that, args);
};

},{}],159:[function(require,module,exports){
'use strict';

// fallback for non-array-like ES3 and non-enumerable old V8 strings
var cof = require('./_cof');
// eslint-disable-next-line no-prototype-builtins
module.exports = Object('z').propertyIsEnumerable(0) ? Object : function (it) {
  return cof(it) == 'String' ? it.split('') : Object(it);
};

},{"./_cof":141}],160:[function(require,module,exports){
'use strict';

// check on default Array iterator
var Iterators = require('./_iterators');
var ITERATOR = require('./_wks')('iterator');
var ArrayProto = Array.prototype;

module.exports = function (it) {
  return it !== undefined && (Iterators.Array === it || ArrayProto[ITERATOR] === it);
};

},{"./_iterators":168,"./_wks":209}],161:[function(require,module,exports){
'use strict';

// 7.2.2 IsArray(argument)
var cof = require('./_cof');
module.exports = Array.isArray || function isArray(arg) {
  return cof(arg) == 'Array';
};

},{"./_cof":141}],162:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

module.exports = function (it) {
  return (typeof it === 'undefined' ? 'undefined' : _typeof(it)) === 'object' ? it !== null : typeof it === 'function';
};

},{}],163:[function(require,module,exports){
'use strict';

// call something on iterator step with safe closing on error
var anObject = require('./_an-object');
module.exports = function (iterator, fn, value, entries) {
  try {
    return entries ? fn(anObject(value)[0], value[1]) : fn(value);
    // 7.4.6 IteratorClose(iterator, completion)
  } catch (e) {
    var ret = iterator['return'];
    if (ret !== undefined) anObject(ret.call(iterator));
    throw e;
  }
};

},{"./_an-object":138}],164:[function(require,module,exports){
'use strict';

var create = require('./_object-create');
var descriptor = require('./_property-desc');
var setToStringTag = require('./_set-to-string-tag');
var IteratorPrototype = {};

// 25.1.2.1.1 %IteratorPrototype%[@@iterator]()
require('./_hide')(IteratorPrototype, require('./_wks')('iterator'), function () {
  return this;
});

module.exports = function (Constructor, NAME, next) {
  Constructor.prototype = create(IteratorPrototype, { next: descriptor(1, next) });
  setToStringTag(Constructor, NAME + ' Iterator');
};

},{"./_hide":155,"./_object-create":174,"./_property-desc":188,"./_set-to-string-tag":193,"./_wks":209}],165:[function(require,module,exports){
'use strict';

var LIBRARY = require('./_library');
var $export = require('./_export');
var redefine = require('./_redefine');
var hide = require('./_hide');
var Iterators = require('./_iterators');
var $iterCreate = require('./_iter-create');
var setToStringTag = require('./_set-to-string-tag');
var getPrototypeOf = require('./_object-gpo');
var ITERATOR = require('./_wks')('iterator');
var BUGGY = !([].keys && 'next' in [].keys()); // Safari has buggy iterators w/o `next`
var FF_ITERATOR = '@@iterator';
var KEYS = 'keys';
var VALUES = 'values';

var returnThis = function returnThis() {
  return this;
};

module.exports = function (Base, NAME, Constructor, next, DEFAULT, IS_SET, FORCED) {
  $iterCreate(Constructor, NAME, next);
  var getMethod = function getMethod(kind) {
    if (!BUGGY && kind in proto) return proto[kind];
    switch (kind) {
      case KEYS:
        return function keys() {
          return new Constructor(this, kind);
        };
      case VALUES:
        return function values() {
          return new Constructor(this, kind);
        };
    }return function entries() {
      return new Constructor(this, kind);
    };
  };
  var TAG = NAME + ' Iterator';
  var DEF_VALUES = DEFAULT == VALUES;
  var VALUES_BUG = false;
  var proto = Base.prototype;
  var $native = proto[ITERATOR] || proto[FF_ITERATOR] || DEFAULT && proto[DEFAULT];
  var $default = $native || getMethod(DEFAULT);
  var $entries = DEFAULT ? !DEF_VALUES ? $default : getMethod('entries') : undefined;
  var $anyNative = NAME == 'Array' ? proto.entries || $native : $native;
  var methods, key, IteratorPrototype;
  // Fix native
  if ($anyNative) {
    IteratorPrototype = getPrototypeOf($anyNative.call(new Base()));
    if (IteratorPrototype !== Object.prototype && IteratorPrototype.next) {
      // Set @@toStringTag to native iterators
      setToStringTag(IteratorPrototype, TAG, true);
      // fix for some old engines
      if (!LIBRARY && typeof IteratorPrototype[ITERATOR] != 'function') hide(IteratorPrototype, ITERATOR, returnThis);
    }
  }
  // fix Array#{values, @@iterator}.name in V8 / FF
  if (DEF_VALUES && $native && $native.name !== VALUES) {
    VALUES_BUG = true;
    $default = function values() {
      return $native.call(this);
    };
  }
  // Define iterator
  if ((!LIBRARY || FORCED) && (BUGGY || VALUES_BUG || !proto[ITERATOR])) {
    hide(proto, ITERATOR, $default);
  }
  // Plug for library
  Iterators[NAME] = $default;
  Iterators[TAG] = returnThis;
  if (DEFAULT) {
    methods = {
      values: DEF_VALUES ? $default : getMethod(VALUES),
      keys: IS_SET ? $default : getMethod(KEYS),
      entries: $entries
    };
    if (FORCED) for (key in methods) {
      if (!(key in proto)) redefine(proto, key, methods[key]);
    } else $export($export.P + $export.F * (BUGGY || VALUES_BUG), NAME, methods);
  }
  return methods;
};

},{"./_export":150,"./_hide":155,"./_iter-create":164,"./_iterators":168,"./_library":169,"./_object-gpo":181,"./_redefine":190,"./_set-to-string-tag":193,"./_wks":209}],166:[function(require,module,exports){
'use strict';

var ITERATOR = require('./_wks')('iterator');
var SAFE_CLOSING = false;

try {
  var riter = [7][ITERATOR]();
  riter['return'] = function () {
    SAFE_CLOSING = true;
  };
  // eslint-disable-next-line no-throw-literal
  Array.from(riter, function () {
    throw 2;
  });
} catch (e) {/* empty */}

module.exports = function (exec, skipClosing) {
  if (!skipClosing && !SAFE_CLOSING) return false;
  var safe = false;
  try {
    var arr = [7];
    var iter = arr[ITERATOR]();
    iter.next = function () {
      return { done: safe = true };
    };
    arr[ITERATOR] = function () {
      return iter;
    };
    exec(arr);
  } catch (e) {/* empty */}
  return safe;
};

},{"./_wks":209}],167:[function(require,module,exports){
"use strict";

module.exports = function (done, value) {
  return { value: value, done: !!done };
};

},{}],168:[function(require,module,exports){
"use strict";

module.exports = {};

},{}],169:[function(require,module,exports){
"use strict";

module.exports = true;

},{}],170:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var META = require('./_uid')('meta');
var isObject = require('./_is-object');
var has = require('./_has');
var setDesc = require('./_object-dp').f;
var id = 0;
var isExtensible = Object.isExtensible || function () {
  return true;
};
var FREEZE = !require('./_fails')(function () {
  return isExtensible(Object.preventExtensions({}));
});
var setMeta = function setMeta(it) {
  setDesc(it, META, { value: {
      i: 'O' + ++id, // object ID
      w: {} // weak collections IDs
    } });
};
var fastKey = function fastKey(it, create) {
  // return primitive with prefix
  if (!isObject(it)) return (typeof it === 'undefined' ? 'undefined' : _typeof(it)) == 'symbol' ? it : (typeof it == 'string' ? 'S' : 'P') + it;
  if (!has(it, META)) {
    // can't set metadata to uncaught frozen object
    if (!isExtensible(it)) return 'F';
    // not necessary to add metadata
    if (!create) return 'E';
    // add missing metadata
    setMeta(it);
    // return object ID
  }return it[META].i;
};
var getWeak = function getWeak(it, create) {
  if (!has(it, META)) {
    // can't set metadata to uncaught frozen object
    if (!isExtensible(it)) return true;
    // not necessary to add metadata
    if (!create) return false;
    // add missing metadata
    setMeta(it);
    // return hash weak collections IDs
  }return it[META].w;
};
// add metadata on freeze-family methods calling
var onFreeze = function onFreeze(it) {
  if (FREEZE && meta.NEED && isExtensible(it) && !has(it, META)) setMeta(it);
  return it;
};
var meta = module.exports = {
  KEY: META,
  NEED: false,
  fastKey: fastKey,
  getWeak: getWeak,
  onFreeze: onFreeze
};

},{"./_fails":151,"./_has":154,"./_is-object":162,"./_object-dp":175,"./_uid":205}],171:[function(require,module,exports){
'use strict';

var global = require('./_global');
var macrotask = require('./_task').set;
var Observer = global.MutationObserver || global.WebKitMutationObserver;
var process = global.process;
var Promise = global.Promise;
var isNode = require('./_cof')(process) == 'process';

module.exports = function () {
  var head, last, notify;

  var flush = function flush() {
    var parent, fn;
    if (isNode && (parent = process.domain)) parent.exit();
    while (head) {
      fn = head.fn;
      head = head.next;
      try {
        fn();
      } catch (e) {
        if (head) notify();else last = undefined;
        throw e;
      }
    }last = undefined;
    if (parent) parent.enter();
  };

  // Node.js
  if (isNode) {
    notify = function notify() {
      process.nextTick(flush);
    };
    // browsers with MutationObserver, except iOS Safari - https://github.com/zloirock/core-js/issues/339
  } else if (Observer && !(global.navigator && global.navigator.standalone)) {
    var toggle = true;
    var node = document.createTextNode('');
    new Observer(flush).observe(node, { characterData: true }); // eslint-disable-line no-new
    notify = function notify() {
      node.data = toggle = !toggle;
    };
    // environments with maybe non-completely correct, but existent Promise
  } else if (Promise && Promise.resolve) {
    // Promise.resolve without an argument throws an error in LG WebOS 2
    var promise = Promise.resolve(undefined);
    notify = function notify() {
      promise.then(flush);
    };
    // for other environments - macrotask based on:
    // - setImmediate
    // - MessageChannel
    // - window.postMessag
    // - onreadystatechange
    // - setTimeout
  } else {
    notify = function notify() {
      // strange IE + webpack dev server bug - use .call(global)
      macrotask.call(global, flush);
    };
  }

  return function (fn) {
    var task = { fn: fn, next: undefined };
    if (last) last.next = task;
    if (!head) {
      head = task;
      notify();
    }last = task;
  };
};

},{"./_cof":141,"./_global":153,"./_task":198}],172:[function(require,module,exports){
'use strict';
// 25.4.1.5 NewPromiseCapability(C)

var aFunction = require('./_a-function');

function PromiseCapability(C) {
  var resolve, reject;
  this.promise = new C(function ($$resolve, $$reject) {
    if (resolve !== undefined || reject !== undefined) throw TypeError('Bad Promise constructor');
    resolve = $$resolve;
    reject = $$reject;
  });
  this.resolve = aFunction(resolve);
  this.reject = aFunction(reject);
}

module.exports.f = function (C) {
  return new PromiseCapability(C);
};

},{"./_a-function":135}],173:[function(require,module,exports){
'use strict';
// 19.1.2.1 Object.assign(target, source, ...)

var getKeys = require('./_object-keys');
var gOPS = require('./_object-gops');
var pIE = require('./_object-pie');
var toObject = require('./_to-object');
var IObject = require('./_iobject');
var $assign = Object.assign;

// should work with symbols and should have deterministic property order (V8 bug)
module.exports = !$assign || require('./_fails')(function () {
  var A = {};
  var B = {};
  // eslint-disable-next-line no-undef
  var S = Symbol();
  var K = 'abcdefghijklmnopqrst';
  A[S] = 7;
  K.split('').forEach(function (k) {
    B[k] = k;
  });
  return $assign({}, A)[S] != 7 || Object.keys($assign({}, B)).join('') != K;
}) ? function assign(target, source) {
  // eslint-disable-line no-unused-vars
  var T = toObject(target);
  var aLen = arguments.length;
  var index = 1;
  var getSymbols = gOPS.f;
  var isEnum = pIE.f;
  while (aLen > index) {
    var S = IObject(arguments[index++]);
    var keys = getSymbols ? getKeys(S).concat(getSymbols(S)) : getKeys(S);
    var length = keys.length;
    var j = 0;
    var key;
    while (length > j) {
      if (isEnum.call(S, key = keys[j++])) T[key] = S[key];
    }
  }return T;
} : $assign;

},{"./_fails":151,"./_iobject":159,"./_object-gops":180,"./_object-keys":183,"./_object-pie":184,"./_to-object":203}],174:[function(require,module,exports){
'use strict';

// 19.1.2.2 / 15.2.3.5 Object.create(O [, Properties])
var anObject = require('./_an-object');
var dPs = require('./_object-dps');
var enumBugKeys = require('./_enum-bug-keys');
var IE_PROTO = require('./_shared-key')('IE_PROTO');
var Empty = function Empty() {/* empty */};
var PROTOTYPE = 'prototype';

// Create object with fake `null` prototype: use iframe Object with cleared prototype
var _createDict = function createDict() {
  // Thrash, waste and sodomy: IE GC bug
  var iframe = require('./_dom-create')('iframe');
  var i = enumBugKeys.length;
  var lt = '<';
  var gt = '>';
  var iframeDocument;
  iframe.style.display = 'none';
  require('./_html').appendChild(iframe);
  iframe.src = 'javascript:'; // eslint-disable-line no-script-url
  // createDict = iframe.contentWindow.Object;
  // html.removeChild(iframe);
  iframeDocument = iframe.contentWindow.document;
  iframeDocument.open();
  iframeDocument.write(lt + 'script' + gt + 'document.F=Object' + lt + '/script' + gt);
  iframeDocument.close();
  _createDict = iframeDocument.F;
  while (i--) {
    delete _createDict[PROTOTYPE][enumBugKeys[i]];
  }return _createDict();
};

module.exports = Object.create || function create(O, Properties) {
  var result;
  if (O !== null) {
    Empty[PROTOTYPE] = anObject(O);
    result = new Empty();
    Empty[PROTOTYPE] = null;
    // add "__proto__" for Object.getPrototypeOf polyfill
    result[IE_PROTO] = O;
  } else result = _createDict();
  return Properties === undefined ? result : dPs(result, Properties);
};

},{"./_an-object":138,"./_dom-create":147,"./_enum-bug-keys":148,"./_html":156,"./_object-dps":176,"./_shared-key":194}],175:[function(require,module,exports){
'use strict';

var anObject = require('./_an-object');
var IE8_DOM_DEFINE = require('./_ie8-dom-define');
var toPrimitive = require('./_to-primitive');
var dP = Object.defineProperty;

exports.f = require('./_descriptors') ? Object.defineProperty : function defineProperty(O, P, Attributes) {
  anObject(O);
  P = toPrimitive(P, true);
  anObject(Attributes);
  if (IE8_DOM_DEFINE) try {
    return dP(O, P, Attributes);
  } catch (e) {/* empty */}
  if ('get' in Attributes || 'set' in Attributes) throw TypeError('Accessors not supported!');
  if ('value' in Attributes) O[P] = Attributes.value;
  return O;
};

},{"./_an-object":138,"./_descriptors":146,"./_ie8-dom-define":157,"./_to-primitive":204}],176:[function(require,module,exports){
'use strict';

var dP = require('./_object-dp');
var anObject = require('./_an-object');
var getKeys = require('./_object-keys');

module.exports = require('./_descriptors') ? Object.defineProperties : function defineProperties(O, Properties) {
  anObject(O);
  var keys = getKeys(Properties);
  var length = keys.length;
  var i = 0;
  var P;
  while (length > i) {
    dP.f(O, P = keys[i++], Properties[P]);
  }return O;
};

},{"./_an-object":138,"./_descriptors":146,"./_object-dp":175,"./_object-keys":183}],177:[function(require,module,exports){
'use strict';

var pIE = require('./_object-pie');
var createDesc = require('./_property-desc');
var toIObject = require('./_to-iobject');
var toPrimitive = require('./_to-primitive');
var has = require('./_has');
var IE8_DOM_DEFINE = require('./_ie8-dom-define');
var gOPD = Object.getOwnPropertyDescriptor;

exports.f = require('./_descriptors') ? gOPD : function getOwnPropertyDescriptor(O, P) {
  O = toIObject(O);
  P = toPrimitive(P, true);
  if (IE8_DOM_DEFINE) try {
    return gOPD(O, P);
  } catch (e) {/* empty */}
  if (has(O, P)) return createDesc(!pIE.f.call(O, P), O[P]);
};

},{"./_descriptors":146,"./_has":154,"./_ie8-dom-define":157,"./_object-pie":184,"./_property-desc":188,"./_to-iobject":201,"./_to-primitive":204}],178:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

// fallback for IE11 buggy Object.getOwnPropertyNames with iframe and window
var toIObject = require('./_to-iobject');
var gOPN = require('./_object-gopn').f;
var toString = {}.toString;

var windowNames = (typeof window === 'undefined' ? 'undefined' : _typeof(window)) == 'object' && window && Object.getOwnPropertyNames ? Object.getOwnPropertyNames(window) : [];

var getWindowNames = function getWindowNames(it) {
  try {
    return gOPN(it);
  } catch (e) {
    return windowNames.slice();
  }
};

module.exports.f = function getOwnPropertyNames(it) {
  return windowNames && toString.call(it) == '[object Window]' ? getWindowNames(it) : gOPN(toIObject(it));
};

},{"./_object-gopn":179,"./_to-iobject":201}],179:[function(require,module,exports){
'use strict';

// 19.1.2.7 / 15.2.3.4 Object.getOwnPropertyNames(O)
var $keys = require('./_object-keys-internal');
var hiddenKeys = require('./_enum-bug-keys').concat('length', 'prototype');

exports.f = Object.getOwnPropertyNames || function getOwnPropertyNames(O) {
  return $keys(O, hiddenKeys);
};

},{"./_enum-bug-keys":148,"./_object-keys-internal":182}],180:[function(require,module,exports){
"use strict";

exports.f = Object.getOwnPropertySymbols;

},{}],181:[function(require,module,exports){
'use strict';

// 19.1.2.9 / 15.2.3.2 Object.getPrototypeOf(O)
var has = require('./_has');
var toObject = require('./_to-object');
var IE_PROTO = require('./_shared-key')('IE_PROTO');
var ObjectProto = Object.prototype;

module.exports = Object.getPrototypeOf || function (O) {
  O = toObject(O);
  if (has(O, IE_PROTO)) return O[IE_PROTO];
  if (typeof O.constructor == 'function' && O instanceof O.constructor) {
    return O.constructor.prototype;
  }return O instanceof Object ? ObjectProto : null;
};

},{"./_has":154,"./_shared-key":194,"./_to-object":203}],182:[function(require,module,exports){
'use strict';

var has = require('./_has');
var toIObject = require('./_to-iobject');
var arrayIndexOf = require('./_array-includes')(false);
var IE_PROTO = require('./_shared-key')('IE_PROTO');

module.exports = function (object, names) {
  var O = toIObject(object);
  var i = 0;
  var result = [];
  var key;
  for (key in O) {
    if (key != IE_PROTO) has(O, key) && result.push(key);
  } // Don't enum bug & hidden keys
  while (names.length > i) {
    if (has(O, key = names[i++])) {
      ~arrayIndexOf(result, key) || result.push(key);
    }
  }return result;
};

},{"./_array-includes":139,"./_has":154,"./_shared-key":194,"./_to-iobject":201}],183:[function(require,module,exports){
'use strict';

// 19.1.2.14 / 15.2.3.14 Object.keys(O)
var $keys = require('./_object-keys-internal');
var enumBugKeys = require('./_enum-bug-keys');

module.exports = Object.keys || function keys(O) {
  return $keys(O, enumBugKeys);
};

},{"./_enum-bug-keys":148,"./_object-keys-internal":182}],184:[function(require,module,exports){
"use strict";

exports.f = {}.propertyIsEnumerable;

},{}],185:[function(require,module,exports){
'use strict';

// most Object methods by ES6 should accept primitives
var $export = require('./_export');
var core = require('./_core');
var fails = require('./_fails');
module.exports = function (KEY, exec) {
  var fn = (core.Object || {})[KEY] || Object[KEY];
  var exp = {};
  exp[KEY] = exec(fn);
  $export($export.S + $export.F * fails(function () {
    fn(1);
  }), 'Object', exp);
};

},{"./_core":142,"./_export":150,"./_fails":151}],186:[function(require,module,exports){
"use strict";

module.exports = function (exec) {
  try {
    return { e: false, v: exec() };
  } catch (e) {
    return { e: true, v: e };
  }
};

},{}],187:[function(require,module,exports){
'use strict';

var anObject = require('./_an-object');
var isObject = require('./_is-object');
var newPromiseCapability = require('./_new-promise-capability');

module.exports = function (C, x) {
  anObject(C);
  if (isObject(x) && x.constructor === C) return x;
  var promiseCapability = newPromiseCapability.f(C);
  var resolve = promiseCapability.resolve;
  resolve(x);
  return promiseCapability.promise;
};

},{"./_an-object":138,"./_is-object":162,"./_new-promise-capability":172}],188:[function(require,module,exports){
"use strict";

module.exports = function (bitmap, value) {
  return {
    enumerable: !(bitmap & 1),
    configurable: !(bitmap & 2),
    writable: !(bitmap & 4),
    value: value
  };
};

},{}],189:[function(require,module,exports){
'use strict';

var hide = require('./_hide');
module.exports = function (target, src, safe) {
  for (var key in src) {
    if (safe && target[key]) target[key] = src[key];else hide(target, key, src[key]);
  }return target;
};

},{"./_hide":155}],190:[function(require,module,exports){
'use strict';

module.exports = require('./_hide');

},{"./_hide":155}],191:[function(require,module,exports){
'use strict';

// Works with __proto__ only. Old v8 can't work with null proto objects.
/* eslint-disable no-proto */
var isObject = require('./_is-object');
var anObject = require('./_an-object');
var check = function check(O, proto) {
  anObject(O);
  if (!isObject(proto) && proto !== null) throw TypeError(proto + ": can't set as prototype!");
};
module.exports = {
  set: Object.setPrototypeOf || ('__proto__' in {} ? // eslint-disable-line
  function (test, buggy, set) {
    try {
      set = require('./_ctx')(Function.call, require('./_object-gopd').f(Object.prototype, '__proto__').set, 2);
      set(test, []);
      buggy = !(test instanceof Array);
    } catch (e) {
      buggy = true;
    }
    return function setPrototypeOf(O, proto) {
      check(O, proto);
      if (buggy) O.__proto__ = proto;else set(O, proto);
      return O;
    };
  }({}, false) : undefined),
  check: check
};

},{"./_an-object":138,"./_ctx":144,"./_is-object":162,"./_object-gopd":177}],192:[function(require,module,exports){
'use strict';

var global = require('./_global');
var core = require('./_core');
var dP = require('./_object-dp');
var DESCRIPTORS = require('./_descriptors');
var SPECIES = require('./_wks')('species');

module.exports = function (KEY) {
  var C = typeof core[KEY] == 'function' ? core[KEY] : global[KEY];
  if (DESCRIPTORS && C && !C[SPECIES]) dP.f(C, SPECIES, {
    configurable: true,
    get: function get() {
      return this;
    }
  });
};

},{"./_core":142,"./_descriptors":146,"./_global":153,"./_object-dp":175,"./_wks":209}],193:[function(require,module,exports){
'use strict';

var def = require('./_object-dp').f;
var has = require('./_has');
var TAG = require('./_wks')('toStringTag');

module.exports = function (it, tag, stat) {
  if (it && !has(it = stat ? it : it.prototype, TAG)) def(it, TAG, { configurable: true, value: tag });
};

},{"./_has":154,"./_object-dp":175,"./_wks":209}],194:[function(require,module,exports){
'use strict';

var shared = require('./_shared')('keys');
var uid = require('./_uid');
module.exports = function (key) {
  return shared[key] || (shared[key] = uid(key));
};

},{"./_shared":195,"./_uid":205}],195:[function(require,module,exports){
'use strict';

var core = require('./_core');
var global = require('./_global');
var SHARED = '__core-js_shared__';
var store = global[SHARED] || (global[SHARED] = {});

(module.exports = function (key, value) {
  return store[key] || (store[key] = value !== undefined ? value : {});
})('versions', []).push({
  version: core.version,
  mode: require('./_library') ? 'pure' : 'global',
  copyright: '© 2018 Denis Pushkarev (zloirock.ru)'
});

},{"./_core":142,"./_global":153,"./_library":169}],196:[function(require,module,exports){
'use strict';

// 7.3.20 SpeciesConstructor(O, defaultConstructor)
var anObject = require('./_an-object');
var aFunction = require('./_a-function');
var SPECIES = require('./_wks')('species');
module.exports = function (O, D) {
  var C = anObject(O).constructor;
  var S;
  return C === undefined || (S = anObject(C)[SPECIES]) == undefined ? D : aFunction(S);
};

},{"./_a-function":135,"./_an-object":138,"./_wks":209}],197:[function(require,module,exports){
'use strict';

var toInteger = require('./_to-integer');
var defined = require('./_defined');
// true  -> String#at
// false -> String#codePointAt
module.exports = function (TO_STRING) {
  return function (that, pos) {
    var s = String(defined(that));
    var i = toInteger(pos);
    var l = s.length;
    var a, b;
    if (i < 0 || i >= l) return TO_STRING ? '' : undefined;
    a = s.charCodeAt(i);
    return a < 0xd800 || a > 0xdbff || i + 1 === l || (b = s.charCodeAt(i + 1)) < 0xdc00 || b > 0xdfff ? TO_STRING ? s.charAt(i) : a : TO_STRING ? s.slice(i, i + 2) : (a - 0xd800 << 10) + (b - 0xdc00) + 0x10000;
  };
};

},{"./_defined":145,"./_to-integer":200}],198:[function(require,module,exports){
'use strict';

var ctx = require('./_ctx');
var invoke = require('./_invoke');
var html = require('./_html');
var cel = require('./_dom-create');
var global = require('./_global');
var process = global.process;
var setTask = global.setImmediate;
var clearTask = global.clearImmediate;
var MessageChannel = global.MessageChannel;
var Dispatch = global.Dispatch;
var counter = 0;
var queue = {};
var ONREADYSTATECHANGE = 'onreadystatechange';
var defer, channel, port;
var run = function run() {
  var id = +this;
  // eslint-disable-next-line no-prototype-builtins
  if (queue.hasOwnProperty(id)) {
    var fn = queue[id];
    delete queue[id];
    fn();
  }
};
var listener = function listener(event) {
  run.call(event.data);
};
// Node.js 0.9+ & IE10+ has setImmediate, otherwise:
if (!setTask || !clearTask) {
  setTask = function setImmediate(fn) {
    var args = [];
    var i = 1;
    while (arguments.length > i) {
      args.push(arguments[i++]);
    }queue[++counter] = function () {
      // eslint-disable-next-line no-new-func
      invoke(typeof fn == 'function' ? fn : Function(fn), args);
    };
    defer(counter);
    return counter;
  };
  clearTask = function clearImmediate(id) {
    delete queue[id];
  };
  // Node.js 0.8-
  if (require('./_cof')(process) == 'process') {
    defer = function defer(id) {
      process.nextTick(ctx(run, id, 1));
    };
    // Sphere (JS game engine) Dispatch API
  } else if (Dispatch && Dispatch.now) {
    defer = function defer(id) {
      Dispatch.now(ctx(run, id, 1));
    };
    // Browsers with MessageChannel, includes WebWorkers
  } else if (MessageChannel) {
    channel = new MessageChannel();
    port = channel.port2;
    channel.port1.onmessage = listener;
    defer = ctx(port.postMessage, port, 1);
    // Browsers with postMessage, skip WebWorkers
    // IE8 has postMessage, but it's sync & typeof its postMessage is 'object'
  } else if (global.addEventListener && typeof postMessage == 'function' && !global.importScripts) {
    defer = function defer(id) {
      global.postMessage(id + '', '*');
    };
    global.addEventListener('message', listener, false);
    // IE8-
  } else if (ONREADYSTATECHANGE in cel('script')) {
    defer = function defer(id) {
      html.appendChild(cel('script'))[ONREADYSTATECHANGE] = function () {
        html.removeChild(this);
        run.call(id);
      };
    };
    // Rest old browsers
  } else {
    defer = function defer(id) {
      setTimeout(ctx(run, id, 1), 0);
    };
  }
}
module.exports = {
  set: setTask,
  clear: clearTask
};

},{"./_cof":141,"./_ctx":144,"./_dom-create":147,"./_global":153,"./_html":156,"./_invoke":158}],199:[function(require,module,exports){
'use strict';

var toInteger = require('./_to-integer');
var max = Math.max;
var min = Math.min;
module.exports = function (index, length) {
  index = toInteger(index);
  return index < 0 ? max(index + length, 0) : min(index, length);
};

},{"./_to-integer":200}],200:[function(require,module,exports){
"use strict";

// 7.1.4 ToInteger
var ceil = Math.ceil;
var floor = Math.floor;
module.exports = function (it) {
  return isNaN(it = +it) ? 0 : (it > 0 ? floor : ceil)(it);
};

},{}],201:[function(require,module,exports){
'use strict';

// to indexed object, toObject with fallback for non-array-like ES3 strings
var IObject = require('./_iobject');
var defined = require('./_defined');
module.exports = function (it) {
  return IObject(defined(it));
};

},{"./_defined":145,"./_iobject":159}],202:[function(require,module,exports){
'use strict';

// 7.1.15 ToLength
var toInteger = require('./_to-integer');
var min = Math.min;
module.exports = function (it) {
  return it > 0 ? min(toInteger(it), 0x1fffffffffffff) : 0; // pow(2, 53) - 1 == 9007199254740991
};

},{"./_to-integer":200}],203:[function(require,module,exports){
'use strict';

// 7.1.13 ToObject(argument)
var defined = require('./_defined');
module.exports = function (it) {
  return Object(defined(it));
};

},{"./_defined":145}],204:[function(require,module,exports){
'use strict';

// 7.1.1 ToPrimitive(input [, PreferredType])
var isObject = require('./_is-object');
// instead of the ES6 spec version, we didn't implement @@toPrimitive case
// and the second argument - flag - preferred type is a string
module.exports = function (it, S) {
  if (!isObject(it)) return it;
  var fn, val;
  if (S && typeof (fn = it.toString) == 'function' && !isObject(val = fn.call(it))) return val;
  if (typeof (fn = it.valueOf) == 'function' && !isObject(val = fn.call(it))) return val;
  if (!S && typeof (fn = it.toString) == 'function' && !isObject(val = fn.call(it))) return val;
  throw TypeError("Can't convert object to primitive value");
};

},{"./_is-object":162}],205:[function(require,module,exports){
'use strict';

var id = 0;
var px = Math.random();
module.exports = function (key) {
  return 'Symbol('.concat(key === undefined ? '' : key, ')_', (++id + px).toString(36));
};

},{}],206:[function(require,module,exports){
'use strict';

var global = require('./_global');
var navigator = global.navigator;

module.exports = navigator && navigator.userAgent || '';

},{"./_global":153}],207:[function(require,module,exports){
'use strict';

var global = require('./_global');
var core = require('./_core');
var LIBRARY = require('./_library');
var wksExt = require('./_wks-ext');
var defineProperty = require('./_object-dp').f;
module.exports = function (name) {
  var $Symbol = core.Symbol || (core.Symbol = LIBRARY ? {} : global.Symbol || {});
  if (name.charAt(0) != '_' && !(name in $Symbol)) defineProperty($Symbol, name, { value: wksExt.f(name) });
};

},{"./_core":142,"./_global":153,"./_library":169,"./_object-dp":175,"./_wks-ext":208}],208:[function(require,module,exports){
'use strict';

exports.f = require('./_wks');

},{"./_wks":209}],209:[function(require,module,exports){
'use strict';

var store = require('./_shared')('wks');
var uid = require('./_uid');
var _Symbol = require('./_global').Symbol;
var USE_SYMBOL = typeof _Symbol == 'function';

var $exports = module.exports = function (name) {
  return store[name] || (store[name] = USE_SYMBOL && _Symbol[name] || (USE_SYMBOL ? _Symbol : uid)('Symbol.' + name));
};

$exports.store = store;

},{"./_global":153,"./_shared":195,"./_uid":205}],210:[function(require,module,exports){
'use strict';

var classof = require('./_classof');
var ITERATOR = require('./_wks')('iterator');
var Iterators = require('./_iterators');
module.exports = require('./_core').getIteratorMethod = function (it) {
  if (it != undefined) return it[ITERATOR] || it['@@iterator'] || Iterators[classof(it)];
};

},{"./_classof":140,"./_core":142,"./_iterators":168,"./_wks":209}],211:[function(require,module,exports){
'use strict';

var anObject = require('./_an-object');
var get = require('./core.get-iterator-method');
module.exports = require('./_core').getIterator = function (it) {
  var iterFn = get(it);
  if (typeof iterFn != 'function') throw TypeError(it + ' is not iterable!');
  return anObject(iterFn.call(it));
};

},{"./_an-object":138,"./_core":142,"./core.get-iterator-method":210}],212:[function(require,module,exports){
'use strict';

var ctx = require('./_ctx');
var $export = require('./_export');
var toObject = require('./_to-object');
var call = require('./_iter-call');
var isArrayIter = require('./_is-array-iter');
var toLength = require('./_to-length');
var createProperty = require('./_create-property');
var getIterFn = require('./core.get-iterator-method');

$export($export.S + $export.F * !require('./_iter-detect')(function (iter) {
  Array.from(iter);
}), 'Array', {
  // 22.1.2.1 Array.from(arrayLike, mapfn = undefined, thisArg = undefined)
  from: function from(arrayLike /* , mapfn = undefined, thisArg = undefined */) {
    var O = toObject(arrayLike);
    var C = typeof this == 'function' ? this : Array;
    var aLen = arguments.length;
    var mapfn = aLen > 1 ? arguments[1] : undefined;
    var mapping = mapfn !== undefined;
    var index = 0;
    var iterFn = getIterFn(O);
    var length, result, step, iterator;
    if (mapping) mapfn = ctx(mapfn, aLen > 2 ? arguments[2] : undefined, 2);
    // if object isn't iterable or it's array with default iterator - use simple case
    if (iterFn != undefined && !(C == Array && isArrayIter(iterFn))) {
      for (iterator = iterFn.call(O), result = new C(); !(step = iterator.next()).done; index++) {
        createProperty(result, index, mapping ? call(iterator, mapfn, [step.value, index], true) : step.value);
      }
    } else {
      length = toLength(O.length);
      for (result = new C(length); length > index; index++) {
        createProperty(result, index, mapping ? mapfn(O[index], index) : O[index]);
      }
    }
    result.length = index;
    return result;
  }
});

},{"./_create-property":143,"./_ctx":144,"./_export":150,"./_is-array-iter":160,"./_iter-call":163,"./_iter-detect":166,"./_to-length":202,"./_to-object":203,"./core.get-iterator-method":210}],213:[function(require,module,exports){
'use strict';

var addToUnscopables = require('./_add-to-unscopables');
var step = require('./_iter-step');
var Iterators = require('./_iterators');
var toIObject = require('./_to-iobject');

// 22.1.3.4 Array.prototype.entries()
// 22.1.3.13 Array.prototype.keys()
// 22.1.3.29 Array.prototype.values()
// 22.1.3.30 Array.prototype[@@iterator]()
module.exports = require('./_iter-define')(Array, 'Array', function (iterated, kind) {
  this._t = toIObject(iterated); // target
  this._i = 0; // next index
  this._k = kind; // kind
  // 22.1.5.2.1 %ArrayIteratorPrototype%.next()
}, function () {
  var O = this._t;
  var kind = this._k;
  var index = this._i++;
  if (!O || index >= O.length) {
    this._t = undefined;
    return step(1);
  }
  if (kind == 'keys') return step(0, index);
  if (kind == 'values') return step(0, O[index]);
  return step(0, [index, O[index]]);
}, 'values');

// argumentsList[@@iterator] is %ArrayProto_values% (9.4.4.6, 9.4.4.7)
Iterators.Arguments = Iterators.Array;

addToUnscopables('keys');
addToUnscopables('values');
addToUnscopables('entries');

},{"./_add-to-unscopables":136,"./_iter-define":165,"./_iter-step":167,"./_iterators":168,"./_to-iobject":201}],214:[function(require,module,exports){
'use strict';

// 19.1.3.1 Object.assign(target, source)
var $export = require('./_export');

$export($export.S + $export.F, 'Object', { assign: require('./_object-assign') });

},{"./_export":150,"./_object-assign":173}],215:[function(require,module,exports){
'use strict';

var $export = require('./_export');
// 19.1.2.2 / 15.2.3.5 Object.create(O [, Properties])
$export($export.S, 'Object', { create: require('./_object-create') });

},{"./_export":150,"./_object-create":174}],216:[function(require,module,exports){
'use strict';

var $export = require('./_export');
// 19.1.2.4 / 15.2.3.6 Object.defineProperty(O, P, Attributes)
$export($export.S + $export.F * !require('./_descriptors'), 'Object', { defineProperty: require('./_object-dp').f });

},{"./_descriptors":146,"./_export":150,"./_object-dp":175}],217:[function(require,module,exports){
'use strict';

// 19.1.2.9 Object.getPrototypeOf(O)
var toObject = require('./_to-object');
var $getPrototypeOf = require('./_object-gpo');

require('./_object-sap')('getPrototypeOf', function () {
  return function getPrototypeOf(it) {
    return $getPrototypeOf(toObject(it));
  };
});

},{"./_object-gpo":181,"./_object-sap":185,"./_to-object":203}],218:[function(require,module,exports){
'use strict';

// 19.1.2.14 Object.keys(O)
var toObject = require('./_to-object');
var $keys = require('./_object-keys');

require('./_object-sap')('keys', function () {
  return function keys(it) {
    return $keys(toObject(it));
  };
});

},{"./_object-keys":183,"./_object-sap":185,"./_to-object":203}],219:[function(require,module,exports){
'use strict';

// 19.1.3.19 Object.setPrototypeOf(O, proto)
var $export = require('./_export');
$export($export.S, 'Object', { setPrototypeOf: require('./_set-proto').set });

},{"./_export":150,"./_set-proto":191}],220:[function(require,module,exports){
"use strict";

},{}],221:[function(require,module,exports){
'use strict';

var LIBRARY = require('./_library');
var global = require('./_global');
var ctx = require('./_ctx');
var classof = require('./_classof');
var $export = require('./_export');
var isObject = require('./_is-object');
var aFunction = require('./_a-function');
var anInstance = require('./_an-instance');
var forOf = require('./_for-of');
var speciesConstructor = require('./_species-constructor');
var task = require('./_task').set;
var microtask = require('./_microtask')();
var newPromiseCapabilityModule = require('./_new-promise-capability');
var perform = require('./_perform');
var userAgent = require('./_user-agent');
var promiseResolve = require('./_promise-resolve');
var PROMISE = 'Promise';
var TypeError = global.TypeError;
var process = global.process;
var versions = process && process.versions;
var v8 = versions && versions.v8 || '';
var $Promise = global[PROMISE];
var isNode = classof(process) == 'process';
var empty = function empty() {/* empty */};
var Internal, newGenericPromiseCapability, OwnPromiseCapability, Wrapper;
var newPromiseCapability = newGenericPromiseCapability = newPromiseCapabilityModule.f;

var USE_NATIVE = !!function () {
  try {
    // correct subclassing with @@species support
    var promise = $Promise.resolve(1);
    var FakePromise = (promise.constructor = {})[require('./_wks')('species')] = function (exec) {
      exec(empty, empty);
    };
    // unhandled rejections tracking support, NodeJS Promise without it fails @@species test
    return (isNode || typeof PromiseRejectionEvent == 'function') && promise.then(empty) instanceof FakePromise
    // v8 6.6 (Node 10 and Chrome 66) have a bug with resolving custom thenables
    // https://bugs.chromium.org/p/chromium/issues/detail?id=830565
    // we can't detect it synchronously, so just check versions
    && v8.indexOf('6.6') !== 0 && userAgent.indexOf('Chrome/66') === -1;
  } catch (e) {/* empty */}
}();

// helpers
var isThenable = function isThenable(it) {
  var then;
  return isObject(it) && typeof (then = it.then) == 'function' ? then : false;
};
var notify = function notify(promise, isReject) {
  if (promise._n) return;
  promise._n = true;
  var chain = promise._c;
  microtask(function () {
    var value = promise._v;
    var ok = promise._s == 1;
    var i = 0;
    var run = function run(reaction) {
      var handler = ok ? reaction.ok : reaction.fail;
      var resolve = reaction.resolve;
      var reject = reaction.reject;
      var domain = reaction.domain;
      var result, then, exited;
      try {
        if (handler) {
          if (!ok) {
            if (promise._h == 2) onHandleUnhandled(promise);
            promise._h = 1;
          }
          if (handler === true) result = value;else {
            if (domain) domain.enter();
            result = handler(value); // may throw
            if (domain) {
              domain.exit();
              exited = true;
            }
          }
          if (result === reaction.promise) {
            reject(TypeError('Promise-chain cycle'));
          } else if (then = isThenable(result)) {
            then.call(result, resolve, reject);
          } else resolve(result);
        } else reject(value);
      } catch (e) {
        if (domain && !exited) domain.exit();
        reject(e);
      }
    };
    while (chain.length > i) {
      run(chain[i++]);
    } // variable length - can't use forEach
    promise._c = [];
    promise._n = false;
    if (isReject && !promise._h) onUnhandled(promise);
  });
};
var onUnhandled = function onUnhandled(promise) {
  task.call(global, function () {
    var value = promise._v;
    var unhandled = isUnhandled(promise);
    var result, handler, console;
    if (unhandled) {
      result = perform(function () {
        if (isNode) {
          process.emit('unhandledRejection', value, promise);
        } else if (handler = global.onunhandledrejection) {
          handler({ promise: promise, reason: value });
        } else if ((console = global.console) && console.error) {
          console.error('Unhandled promise rejection', value);
        }
      });
      // Browsers should not trigger `rejectionHandled` event if it was handled here, NodeJS - should
      promise._h = isNode || isUnhandled(promise) ? 2 : 1;
    }promise._a = undefined;
    if (unhandled && result.e) throw result.v;
  });
};
var isUnhandled = function isUnhandled(promise) {
  return promise._h !== 1 && (promise._a || promise._c).length === 0;
};
var onHandleUnhandled = function onHandleUnhandled(promise) {
  task.call(global, function () {
    var handler;
    if (isNode) {
      process.emit('rejectionHandled', promise);
    } else if (handler = global.onrejectionhandled) {
      handler({ promise: promise, reason: promise._v });
    }
  });
};
var $reject = function $reject(value) {
  var promise = this;
  if (promise._d) return;
  promise._d = true;
  promise = promise._w || promise; // unwrap
  promise._v = value;
  promise._s = 2;
  if (!promise._a) promise._a = promise._c.slice();
  notify(promise, true);
};
var $resolve = function $resolve(value) {
  var promise = this;
  var then;
  if (promise._d) return;
  promise._d = true;
  promise = promise._w || promise; // unwrap
  try {
    if (promise === value) throw TypeError("Promise can't be resolved itself");
    if (then = isThenable(value)) {
      microtask(function () {
        var wrapper = { _w: promise, _d: false }; // wrap
        try {
          then.call(value, ctx($resolve, wrapper, 1), ctx($reject, wrapper, 1));
        } catch (e) {
          $reject.call(wrapper, e);
        }
      });
    } else {
      promise._v = value;
      promise._s = 1;
      notify(promise, false);
    }
  } catch (e) {
    $reject.call({ _w: promise, _d: false }, e); // wrap
  }
};

// constructor polyfill
if (!USE_NATIVE) {
  // 25.4.3.1 Promise(executor)
  $Promise = function Promise(executor) {
    anInstance(this, $Promise, PROMISE, '_h');
    aFunction(executor);
    Internal.call(this);
    try {
      executor(ctx($resolve, this, 1), ctx($reject, this, 1));
    } catch (err) {
      $reject.call(this, err);
    }
  };
  // eslint-disable-next-line no-unused-vars
  Internal = function Promise(executor) {
    this._c = []; // <- awaiting reactions
    this._a = undefined; // <- checked in isUnhandled reactions
    this._s = 0; // <- state
    this._d = false; // <- done
    this._v = undefined; // <- value
    this._h = 0; // <- rejection state, 0 - default, 1 - handled, 2 - unhandled
    this._n = false; // <- notify
  };
  Internal.prototype = require('./_redefine-all')($Promise.prototype, {
    // 25.4.5.3 Promise.prototype.then(onFulfilled, onRejected)
    then: function then(onFulfilled, onRejected) {
      var reaction = newPromiseCapability(speciesConstructor(this, $Promise));
      reaction.ok = typeof onFulfilled == 'function' ? onFulfilled : true;
      reaction.fail = typeof onRejected == 'function' && onRejected;
      reaction.domain = isNode ? process.domain : undefined;
      this._c.push(reaction);
      if (this._a) this._a.push(reaction);
      if (this._s) notify(this, false);
      return reaction.promise;
    },
    // 25.4.5.1 Promise.prototype.catch(onRejected)
    'catch': function _catch(onRejected) {
      return this.then(undefined, onRejected);
    }
  });
  OwnPromiseCapability = function OwnPromiseCapability() {
    var promise = new Internal();
    this.promise = promise;
    this.resolve = ctx($resolve, promise, 1);
    this.reject = ctx($reject, promise, 1);
  };
  newPromiseCapabilityModule.f = newPromiseCapability = function newPromiseCapability(C) {
    return C === $Promise || C === Wrapper ? new OwnPromiseCapability(C) : newGenericPromiseCapability(C);
  };
}

$export($export.G + $export.W + $export.F * !USE_NATIVE, { Promise: $Promise });
require('./_set-to-string-tag')($Promise, PROMISE);
require('./_set-species')(PROMISE);
Wrapper = require('./_core')[PROMISE];

// statics
$export($export.S + $export.F * !USE_NATIVE, PROMISE, {
  // 25.4.4.5 Promise.reject(r)
  reject: function reject(r) {
    var capability = newPromiseCapability(this);
    var $$reject = capability.reject;
    $$reject(r);
    return capability.promise;
  }
});
$export($export.S + $export.F * (LIBRARY || !USE_NATIVE), PROMISE, {
  // 25.4.4.6 Promise.resolve(x)
  resolve: function resolve(x) {
    return promiseResolve(LIBRARY && this === Wrapper ? $Promise : this, x);
  }
});
$export($export.S + $export.F * !(USE_NATIVE && require('./_iter-detect')(function (iter) {
  $Promise.all(iter)['catch'](empty);
})), PROMISE, {
  // 25.4.4.1 Promise.all(iterable)
  all: function all(iterable) {
    var C = this;
    var capability = newPromiseCapability(C);
    var resolve = capability.resolve;
    var reject = capability.reject;
    var result = perform(function () {
      var values = [];
      var index = 0;
      var remaining = 1;
      forOf(iterable, false, function (promise) {
        var $index = index++;
        var alreadyCalled = false;
        values.push(undefined);
        remaining++;
        C.resolve(promise).then(function (value) {
          if (alreadyCalled) return;
          alreadyCalled = true;
          values[$index] = value;
          --remaining || resolve(values);
        }, reject);
      });
      --remaining || resolve(values);
    });
    if (result.e) reject(result.v);
    return capability.promise;
  },
  // 25.4.4.4 Promise.race(iterable)
  race: function race(iterable) {
    var C = this;
    var capability = newPromiseCapability(C);
    var reject = capability.reject;
    var result = perform(function () {
      forOf(iterable, false, function (promise) {
        C.resolve(promise).then(capability.resolve, reject);
      });
    });
    if (result.e) reject(result.v);
    return capability.promise;
  }
});

},{"./_a-function":135,"./_an-instance":137,"./_classof":140,"./_core":142,"./_ctx":144,"./_export":150,"./_for-of":152,"./_global":153,"./_is-object":162,"./_iter-detect":166,"./_library":169,"./_microtask":171,"./_new-promise-capability":172,"./_perform":186,"./_promise-resolve":187,"./_redefine-all":189,"./_set-species":192,"./_set-to-string-tag":193,"./_species-constructor":196,"./_task":198,"./_user-agent":206,"./_wks":209}],222:[function(require,module,exports){
'use strict';

var $at = require('./_string-at')(true);

// 21.1.3.27 String.prototype[@@iterator]()
require('./_iter-define')(String, 'String', function (iterated) {
  this._t = String(iterated); // target
  this._i = 0; // next index
  // 21.1.5.2.1 %StringIteratorPrototype%.next()
}, function () {
  var O = this._t;
  var index = this._i;
  var point;
  if (index >= O.length) return { value: undefined, done: true };
  point = $at(O, index);
  this._i += point.length;
  return { value: point, done: false };
});

},{"./_iter-define":165,"./_string-at":197}],223:[function(require,module,exports){
'use strict';
// ECMAScript 6 symbols shim

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var global = require('./_global');
var has = require('./_has');
var DESCRIPTORS = require('./_descriptors');
var $export = require('./_export');
var redefine = require('./_redefine');
var META = require('./_meta').KEY;
var $fails = require('./_fails');
var shared = require('./_shared');
var setToStringTag = require('./_set-to-string-tag');
var uid = require('./_uid');
var wks = require('./_wks');
var wksExt = require('./_wks-ext');
var wksDefine = require('./_wks-define');
var enumKeys = require('./_enum-keys');
var isArray = require('./_is-array');
var anObject = require('./_an-object');
var isObject = require('./_is-object');
var toIObject = require('./_to-iobject');
var toPrimitive = require('./_to-primitive');
var createDesc = require('./_property-desc');
var _create = require('./_object-create');
var gOPNExt = require('./_object-gopn-ext');
var $GOPD = require('./_object-gopd');
var $DP = require('./_object-dp');
var $keys = require('./_object-keys');
var gOPD = $GOPD.f;
var dP = $DP.f;
var gOPN = gOPNExt.f;
var $Symbol = global.Symbol;
var $JSON = global.JSON;
var _stringify = $JSON && $JSON.stringify;
var PROTOTYPE = 'prototype';
var HIDDEN = wks('_hidden');
var TO_PRIMITIVE = wks('toPrimitive');
var isEnum = {}.propertyIsEnumerable;
var SymbolRegistry = shared('symbol-registry');
var AllSymbols = shared('symbols');
var OPSymbols = shared('op-symbols');
var ObjectProto = Object[PROTOTYPE];
var USE_NATIVE = typeof $Symbol == 'function';
var QObject = global.QObject;
// Don't use setters in Qt Script, https://github.com/zloirock/core-js/issues/173
var setter = !QObject || !QObject[PROTOTYPE] || !QObject[PROTOTYPE].findChild;

// fallback for old Android, https://code.google.com/p/v8/issues/detail?id=687
var setSymbolDesc = DESCRIPTORS && $fails(function () {
  return _create(dP({}, 'a', {
    get: function get() {
      return dP(this, 'a', { value: 7 }).a;
    }
  })).a != 7;
}) ? function (it, key, D) {
  var protoDesc = gOPD(ObjectProto, key);
  if (protoDesc) delete ObjectProto[key];
  dP(it, key, D);
  if (protoDesc && it !== ObjectProto) dP(ObjectProto, key, protoDesc);
} : dP;

var wrap = function wrap(tag) {
  var sym = AllSymbols[tag] = _create($Symbol[PROTOTYPE]);
  sym._k = tag;
  return sym;
};

var isSymbol = USE_NATIVE && _typeof($Symbol.iterator) == 'symbol' ? function (it) {
  return (typeof it === 'undefined' ? 'undefined' : _typeof(it)) == 'symbol';
} : function (it) {
  return it instanceof $Symbol;
};

var $defineProperty = function defineProperty(it, key, D) {
  if (it === ObjectProto) $defineProperty(OPSymbols, key, D);
  anObject(it);
  key = toPrimitive(key, true);
  anObject(D);
  if (has(AllSymbols, key)) {
    if (!D.enumerable) {
      if (!has(it, HIDDEN)) dP(it, HIDDEN, createDesc(1, {}));
      it[HIDDEN][key] = true;
    } else {
      if (has(it, HIDDEN) && it[HIDDEN][key]) it[HIDDEN][key] = false;
      D = _create(D, { enumerable: createDesc(0, false) });
    }return setSymbolDesc(it, key, D);
  }return dP(it, key, D);
};
var $defineProperties = function defineProperties(it, P) {
  anObject(it);
  var keys = enumKeys(P = toIObject(P));
  var i = 0;
  var l = keys.length;
  var key;
  while (l > i) {
    $defineProperty(it, key = keys[i++], P[key]);
  }return it;
};
var $create = function create(it, P) {
  return P === undefined ? _create(it) : $defineProperties(_create(it), P);
};
var $propertyIsEnumerable = function propertyIsEnumerable(key) {
  var E = isEnum.call(this, key = toPrimitive(key, true));
  if (this === ObjectProto && has(AllSymbols, key) && !has(OPSymbols, key)) return false;
  return E || !has(this, key) || !has(AllSymbols, key) || has(this, HIDDEN) && this[HIDDEN][key] ? E : true;
};
var $getOwnPropertyDescriptor = function getOwnPropertyDescriptor(it, key) {
  it = toIObject(it);
  key = toPrimitive(key, true);
  if (it === ObjectProto && has(AllSymbols, key) && !has(OPSymbols, key)) return;
  var D = gOPD(it, key);
  if (D && has(AllSymbols, key) && !(has(it, HIDDEN) && it[HIDDEN][key])) D.enumerable = true;
  return D;
};
var $getOwnPropertyNames = function getOwnPropertyNames(it) {
  var names = gOPN(toIObject(it));
  var result = [];
  var i = 0;
  var key;
  while (names.length > i) {
    if (!has(AllSymbols, key = names[i++]) && key != HIDDEN && key != META) result.push(key);
  }return result;
};
var $getOwnPropertySymbols = function getOwnPropertySymbols(it) {
  var IS_OP = it === ObjectProto;
  var names = gOPN(IS_OP ? OPSymbols : toIObject(it));
  var result = [];
  var i = 0;
  var key;
  while (names.length > i) {
    if (has(AllSymbols, key = names[i++]) && (IS_OP ? has(ObjectProto, key) : true)) result.push(AllSymbols[key]);
  }return result;
};

// 19.4.1.1 Symbol([description])
if (!USE_NATIVE) {
  $Symbol = function _Symbol() {
    if (this instanceof $Symbol) throw TypeError('Symbol is not a constructor!');
    var tag = uid(arguments.length > 0 ? arguments[0] : undefined);
    var $set = function $set(value) {
      if (this === ObjectProto) $set.call(OPSymbols, value);
      if (has(this, HIDDEN) && has(this[HIDDEN], tag)) this[HIDDEN][tag] = false;
      setSymbolDesc(this, tag, createDesc(1, value));
    };
    if (DESCRIPTORS && setter) setSymbolDesc(ObjectProto, tag, { configurable: true, set: $set });
    return wrap(tag);
  };
  redefine($Symbol[PROTOTYPE], 'toString', function toString() {
    return this._k;
  });

  $GOPD.f = $getOwnPropertyDescriptor;
  $DP.f = $defineProperty;
  require('./_object-gopn').f = gOPNExt.f = $getOwnPropertyNames;
  require('./_object-pie').f = $propertyIsEnumerable;
  require('./_object-gops').f = $getOwnPropertySymbols;

  if (DESCRIPTORS && !require('./_library')) {
    redefine(ObjectProto, 'propertyIsEnumerable', $propertyIsEnumerable, true);
  }

  wksExt.f = function (name) {
    return wrap(wks(name));
  };
}

$export($export.G + $export.W + $export.F * !USE_NATIVE, { Symbol: $Symbol });

for (var es6Symbols =
// 19.4.2.2, 19.4.2.3, 19.4.2.4, 19.4.2.6, 19.4.2.8, 19.4.2.9, 19.4.2.10, 19.4.2.11, 19.4.2.12, 19.4.2.13, 19.4.2.14
'hasInstance,isConcatSpreadable,iterator,match,replace,search,species,split,toPrimitive,toStringTag,unscopables'.split(','), j = 0; es6Symbols.length > j;) {
  wks(es6Symbols[j++]);
}for (var wellKnownSymbols = $keys(wks.store), k = 0; wellKnownSymbols.length > k;) {
  wksDefine(wellKnownSymbols[k++]);
}$export($export.S + $export.F * !USE_NATIVE, 'Symbol', {
  // 19.4.2.1 Symbol.for(key)
  'for': function _for(key) {
    return has(SymbolRegistry, key += '') ? SymbolRegistry[key] : SymbolRegistry[key] = $Symbol(key);
  },
  // 19.4.2.5 Symbol.keyFor(sym)
  keyFor: function keyFor(sym) {
    if (!isSymbol(sym)) throw TypeError(sym + ' is not a symbol!');
    for (var key in SymbolRegistry) {
      if (SymbolRegistry[key] === sym) return key;
    }
  },
  useSetter: function useSetter() {
    setter = true;
  },
  useSimple: function useSimple() {
    setter = false;
  }
});

$export($export.S + $export.F * !USE_NATIVE, 'Object', {
  // 19.1.2.2 Object.create(O [, Properties])
  create: $create,
  // 19.1.2.4 Object.defineProperty(O, P, Attributes)
  defineProperty: $defineProperty,
  // 19.1.2.3 Object.defineProperties(O, Properties)
  defineProperties: $defineProperties,
  // 19.1.2.6 Object.getOwnPropertyDescriptor(O, P)
  getOwnPropertyDescriptor: $getOwnPropertyDescriptor,
  // 19.1.2.7 Object.getOwnPropertyNames(O)
  getOwnPropertyNames: $getOwnPropertyNames,
  // 19.1.2.8 Object.getOwnPropertySymbols(O)
  getOwnPropertySymbols: $getOwnPropertySymbols
});

// 24.3.2 JSON.stringify(value [, replacer [, space]])
$JSON && $export($export.S + $export.F * (!USE_NATIVE || $fails(function () {
  var S = $Symbol();
  // MS Edge converts symbol values to JSON as {}
  // WebKit converts symbol values to JSON as null
  // V8 throws on boxed symbols
  return _stringify([S]) != '[null]' || _stringify({ a: S }) != '{}' || _stringify(Object(S)) != '{}';
})), 'JSON', {
  stringify: function stringify(it) {
    var args = [it];
    var i = 1;
    var replacer, $replacer;
    while (arguments.length > i) {
      args.push(arguments[i++]);
    }$replacer = replacer = args[1];
    if (!isObject(replacer) && it === undefined || isSymbol(it)) return; // IE8 returns string on undefined
    if (!isArray(replacer)) replacer = function replacer(key, value) {
      if (typeof $replacer == 'function') value = $replacer.call(this, key, value);
      if (!isSymbol(value)) return value;
    };
    args[1] = replacer;
    return _stringify.apply($JSON, args);
  }
});

// 19.4.3.4 Symbol.prototype[@@toPrimitive](hint)
$Symbol[PROTOTYPE][TO_PRIMITIVE] || require('./_hide')($Symbol[PROTOTYPE], TO_PRIMITIVE, $Symbol[PROTOTYPE].valueOf);
// 19.4.3.5 Symbol.prototype[@@toStringTag]
setToStringTag($Symbol, 'Symbol');
// 20.2.1.9 Math[@@toStringTag]
setToStringTag(Math, 'Math', true);
// 24.3.3 JSON[@@toStringTag]
setToStringTag(global.JSON, 'JSON', true);

},{"./_an-object":138,"./_descriptors":146,"./_enum-keys":149,"./_export":150,"./_fails":151,"./_global":153,"./_has":154,"./_hide":155,"./_is-array":161,"./_is-object":162,"./_library":169,"./_meta":170,"./_object-create":174,"./_object-dp":175,"./_object-gopd":177,"./_object-gopn":179,"./_object-gopn-ext":178,"./_object-gops":180,"./_object-keys":183,"./_object-pie":184,"./_property-desc":188,"./_redefine":190,"./_set-to-string-tag":193,"./_shared":195,"./_to-iobject":201,"./_to-primitive":204,"./_uid":205,"./_wks":209,"./_wks-define":207,"./_wks-ext":208}],224:[function(require,module,exports){
// https://github.com/tc39/proposal-promise-finally
'use strict';

var $export = require('./_export');
var core = require('./_core');
var global = require('./_global');
var speciesConstructor = require('./_species-constructor');
var promiseResolve = require('./_promise-resolve');

$export($export.P + $export.R, 'Promise', { 'finally': function _finally(onFinally) {
    var C = speciesConstructor(this, core.Promise || global.Promise);
    var isFunction = typeof onFinally == 'function';
    return this.then(isFunction ? function (x) {
      return promiseResolve(C, onFinally()).then(function () {
        return x;
      });
    } : onFinally, isFunction ? function (e) {
      return promiseResolve(C, onFinally()).then(function () {
        throw e;
      });
    } : onFinally);
  } });

},{"./_core":142,"./_export":150,"./_global":153,"./_promise-resolve":187,"./_species-constructor":196}],225:[function(require,module,exports){
'use strict';
// https://github.com/tc39/proposal-promise-try

var $export = require('./_export');
var newPromiseCapability = require('./_new-promise-capability');
var perform = require('./_perform');

$export($export.S, 'Promise', { 'try': function _try(callbackfn) {
    var promiseCapability = newPromiseCapability.f(this);
    var result = perform(callbackfn);
    (result.e ? promiseCapability.reject : promiseCapability.resolve)(result.v);
    return promiseCapability.promise;
  } });

},{"./_export":150,"./_new-promise-capability":172,"./_perform":186}],226:[function(require,module,exports){
'use strict';

require('./_wks-define')('asyncIterator');

},{"./_wks-define":207}],227:[function(require,module,exports){
'use strict';

require('./_wks-define')('observable');

},{"./_wks-define":207}],228:[function(require,module,exports){
'use strict';

require('./es6.array.iterator');
var global = require('./_global');
var hide = require('./_hide');
var Iterators = require('./_iterators');
var TO_STRING_TAG = require('./_wks')('toStringTag');

var DOMIterables = ('CSSRuleList,CSSStyleDeclaration,CSSValueList,ClientRectList,DOMRectList,DOMStringList,' + 'DOMTokenList,DataTransferItemList,FileList,HTMLAllCollection,HTMLCollection,HTMLFormElement,HTMLSelectElement,' + 'MediaList,MimeTypeArray,NamedNodeMap,NodeList,PaintRequestList,Plugin,PluginArray,SVGLengthList,SVGNumberList,' + 'SVGPathSegList,SVGPointList,SVGStringList,SVGTransformList,SourceBufferList,StyleSheetList,TextTrackCueList,' + 'TextTrackList,TouchList').split(',');

for (var i = 0; i < DOMIterables.length; i++) {
  var NAME = DOMIterables[i];
  var Collection = global[NAME];
  var proto = Collection && Collection.prototype;
  if (proto && !proto[TO_STRING_TAG]) hide(proto, TO_STRING_TAG, NAME);
  Iterators[NAME] = Iterators.Array;
}

},{"./_global":153,"./_hide":155,"./_iterators":168,"./_wks":209,"./es6.array.iterator":213}],229:[function(require,module,exports){
arguments[4][135][0].apply(exports,arguments)
},{"dup":135}],230:[function(require,module,exports){
'use strict';

var cof = require('./_cof');
module.exports = function (it, msg) {
  if (typeof it != 'number' && cof(it) != 'Number') throw TypeError(msg);
  return +it;
};

},{"./_cof":244}],231:[function(require,module,exports){
'use strict';

// 22.1.3.31 Array.prototype[@@unscopables]
var UNSCOPABLES = require('./_wks')('unscopables');
var ArrayProto = Array.prototype;
if (ArrayProto[UNSCOPABLES] == undefined) require('./_hide')(ArrayProto, UNSCOPABLES, {});
module.exports = function (key) {
  ArrayProto[UNSCOPABLES][key] = true;
};

},{"./_hide":268,"./_wks":352}],232:[function(require,module,exports){
arguments[4][137][0].apply(exports,arguments)
},{"dup":137}],233:[function(require,module,exports){
arguments[4][138][0].apply(exports,arguments)
},{"./_is-object":277,"dup":138}],234:[function(require,module,exports){
// 22.1.3.3 Array.prototype.copyWithin(target, start, end = this.length)
'use strict';

var toObject = require('./_to-object');
var toAbsoluteIndex = require('./_to-absolute-index');
var toLength = require('./_to-length');

module.exports = [].copyWithin || function copyWithin(target /* = 0 */, start /* = 0, end = @length */) {
  var O = toObject(this);
  var len = toLength(O.length);
  var to = toAbsoluteIndex(target, len);
  var from = toAbsoluteIndex(start, len);
  var end = arguments.length > 2 ? arguments[2] : undefined;
  var count = Math.min((end === undefined ? len : toAbsoluteIndex(end, len)) - from, len - to);
  var inc = 1;
  if (from < to && to < from + count) {
    inc = -1;
    from += count - 1;
    to += count - 1;
  }
  while (count-- > 0) {
    if (from in O) O[to] = O[from];else delete O[to];
    to += inc;
    from += inc;
  }return O;
};

},{"./_to-absolute-index":337,"./_to-length":341,"./_to-object":342}],235:[function(require,module,exports){
// 22.1.3.6 Array.prototype.fill(value, start = 0, end = this.length)
'use strict';

var toObject = require('./_to-object');
var toAbsoluteIndex = require('./_to-absolute-index');
var toLength = require('./_to-length');
module.exports = function fill(value /* , start = 0, end = @length */) {
  var O = toObject(this);
  var length = toLength(O.length);
  var aLen = arguments.length;
  var index = toAbsoluteIndex(aLen > 1 ? arguments[1] : undefined, length);
  var end = aLen > 2 ? arguments[2] : undefined;
  var endPos = end === undefined ? length : toAbsoluteIndex(end, length);
  while (endPos > index) {
    O[index++] = value;
  }return O;
};

},{"./_to-absolute-index":337,"./_to-length":341,"./_to-object":342}],236:[function(require,module,exports){
'use strict';

var forOf = require('./_for-of');

module.exports = function (iter, ITERATOR) {
  var result = [];
  forOf(iter, false, result.push, result, ITERATOR);
  return result;
};

},{"./_for-of":265}],237:[function(require,module,exports){
arguments[4][139][0].apply(exports,arguments)
},{"./_to-absolute-index":337,"./_to-iobject":340,"./_to-length":341,"dup":139}],238:[function(require,module,exports){
'use strict';

// 0 -> Array#forEach
// 1 -> Array#map
// 2 -> Array#filter
// 3 -> Array#some
// 4 -> Array#every
// 5 -> Array#find
// 6 -> Array#findIndex
var ctx = require('./_ctx');
var IObject = require('./_iobject');
var toObject = require('./_to-object');
var toLength = require('./_to-length');
var asc = require('./_array-species-create');
module.exports = function (TYPE, $create) {
  var IS_MAP = TYPE == 1;
  var IS_FILTER = TYPE == 2;
  var IS_SOME = TYPE == 3;
  var IS_EVERY = TYPE == 4;
  var IS_FIND_INDEX = TYPE == 6;
  var NO_HOLES = TYPE == 5 || IS_FIND_INDEX;
  var create = $create || asc;
  return function ($this, callbackfn, that) {
    var O = toObject($this);
    var self = IObject(O);
    var f = ctx(callbackfn, that, 3);
    var length = toLength(self.length);
    var index = 0;
    var result = IS_MAP ? create($this, length) : IS_FILTER ? create($this, 0) : undefined;
    var val, res;
    for (; length > index; index++) {
      if (NO_HOLES || index in self) {
        val = self[index];
        res = f(val, index, O);
        if (TYPE) {
          if (IS_MAP) result[index] = res; // map
          else if (res) switch (TYPE) {
              case 3:
                return true; // some
              case 5:
                return val; // find
              case 6:
                return index; // findIndex
              case 2:
                result.push(val); // filter
            } else if (IS_EVERY) return false; // every
        }
      }
    }return IS_FIND_INDEX ? -1 : IS_SOME || IS_EVERY ? IS_EVERY : result;
  };
};

},{"./_array-species-create":241,"./_ctx":251,"./_iobject":273,"./_to-length":341,"./_to-object":342}],239:[function(require,module,exports){
'use strict';

var aFunction = require('./_a-function');
var toObject = require('./_to-object');
var IObject = require('./_iobject');
var toLength = require('./_to-length');

module.exports = function (that, callbackfn, aLen, memo, isRight) {
  aFunction(callbackfn);
  var O = toObject(that);
  var self = IObject(O);
  var length = toLength(O.length);
  var index = isRight ? length - 1 : 0;
  var i = isRight ? -1 : 1;
  if (aLen < 2) for (;;) {
    if (index in self) {
      memo = self[index];
      index += i;
      break;
    }
    index += i;
    if (isRight ? index < 0 : length <= index) {
      throw TypeError('Reduce of empty array with no initial value');
    }
  }
  for (; isRight ? index >= 0 : length > index; index += i) {
    if (index in self) {
      memo = callbackfn(memo, self[index], index, O);
    }
  }return memo;
};

},{"./_a-function":229,"./_iobject":273,"./_to-length":341,"./_to-object":342}],240:[function(require,module,exports){
'use strict';

var isObject = require('./_is-object');
var isArray = require('./_is-array');
var SPECIES = require('./_wks')('species');

module.exports = function (original) {
  var C;
  if (isArray(original)) {
    C = original.constructor;
    // cross-realm fallback
    if (typeof C == 'function' && (C === Array || isArray(C.prototype))) C = undefined;
    if (isObject(C)) {
      C = C[SPECIES];
      if (C === null) C = undefined;
    }
  }return C === undefined ? Array : C;
};

},{"./_is-array":275,"./_is-object":277,"./_wks":352}],241:[function(require,module,exports){
'use strict';

// 9.4.2.3 ArraySpeciesCreate(originalArray, length)
var speciesConstructor = require('./_array-species-constructor');

module.exports = function (original, length) {
  return new (speciesConstructor(original))(length);
};

},{"./_array-species-constructor":240}],242:[function(require,module,exports){
'use strict';

var aFunction = require('./_a-function');
var isObject = require('./_is-object');
var invoke = require('./_invoke');
var arraySlice = [].slice;
var factories = {};

var construct = function construct(F, len, args) {
  if (!(len in factories)) {
    for (var n = [], i = 0; i < len; i++) {
      n[i] = 'a[' + i + ']';
    } // eslint-disable-next-line no-new-func
    factories[len] = Function('F,a', 'return new F(' + n.join(',') + ')');
  }return factories[len](F, args);
};

module.exports = Function.bind || function bind(that /* , ...args */) {
  var fn = aFunction(this);
  var partArgs = arraySlice.call(arguments, 1);
  var bound = function bound() /* args... */{
    var args = partArgs.concat(arraySlice.call(arguments));
    return this instanceof bound ? construct(fn, args.length, args) : invoke(fn, args, that);
  };
  if (isObject(fn.prototype)) bound.prototype = fn.prototype;
  return bound;
};

},{"./_a-function":229,"./_invoke":272,"./_is-object":277}],243:[function(require,module,exports){
arguments[4][140][0].apply(exports,arguments)
},{"./_cof":244,"./_wks":352,"dup":140}],244:[function(require,module,exports){
arguments[4][141][0].apply(exports,arguments)
},{"dup":141}],245:[function(require,module,exports){
'use strict';

var dP = require('./_object-dp').f;
var create = require('./_object-create');
var redefineAll = require('./_redefine-all');
var ctx = require('./_ctx');
var anInstance = require('./_an-instance');
var forOf = require('./_for-of');
var $iterDefine = require('./_iter-define');
var step = require('./_iter-step');
var setSpecies = require('./_set-species');
var DESCRIPTORS = require('./_descriptors');
var fastKey = require('./_meta').fastKey;
var validate = require('./_validate-collection');
var SIZE = DESCRIPTORS ? '_s' : 'size';

var getEntry = function getEntry(that, key) {
  // fast case
  var index = fastKey(key);
  var entry;
  if (index !== 'F') return that._i[index];
  // frozen object case
  for (entry = that._f; entry; entry = entry.n) {
    if (entry.k == key) return entry;
  }
};

module.exports = {
  getConstructor: function getConstructor(wrapper, NAME, IS_MAP, ADDER) {
    var C = wrapper(function (that, iterable) {
      anInstance(that, C, NAME, '_i');
      that._t = NAME; // collection type
      that._i = create(null); // index
      that._f = undefined; // first entry
      that._l = undefined; // last entry
      that[SIZE] = 0; // size
      if (iterable != undefined) forOf(iterable, IS_MAP, that[ADDER], that);
    });
    redefineAll(C.prototype, {
      // 23.1.3.1 Map.prototype.clear()
      // 23.2.3.2 Set.prototype.clear()
      clear: function clear() {
        for (var that = validate(this, NAME), data = that._i, entry = that._f; entry; entry = entry.n) {
          entry.r = true;
          if (entry.p) entry.p = entry.p.n = undefined;
          delete data[entry.i];
        }
        that._f = that._l = undefined;
        that[SIZE] = 0;
      },
      // 23.1.3.3 Map.prototype.delete(key)
      // 23.2.3.4 Set.prototype.delete(value)
      'delete': function _delete(key) {
        var that = validate(this, NAME);
        var entry = getEntry(that, key);
        if (entry) {
          var next = entry.n;
          var prev = entry.p;
          delete that._i[entry.i];
          entry.r = true;
          if (prev) prev.n = next;
          if (next) next.p = prev;
          if (that._f == entry) that._f = next;
          if (that._l == entry) that._l = prev;
          that[SIZE]--;
        }return !!entry;
      },
      // 23.2.3.6 Set.prototype.forEach(callbackfn, thisArg = undefined)
      // 23.1.3.5 Map.prototype.forEach(callbackfn, thisArg = undefined)
      forEach: function forEach(callbackfn /* , that = undefined */) {
        validate(this, NAME);
        var f = ctx(callbackfn, arguments.length > 1 ? arguments[1] : undefined, 3);
        var entry;
        while (entry = entry ? entry.n : this._f) {
          f(entry.v, entry.k, this);
          // revert to the last existing entry
          while (entry && entry.r) {
            entry = entry.p;
          }
        }
      },
      // 23.1.3.7 Map.prototype.has(key)
      // 23.2.3.7 Set.prototype.has(value)
      has: function has(key) {
        return !!getEntry(validate(this, NAME), key);
      }
    });
    if (DESCRIPTORS) dP(C.prototype, 'size', {
      get: function get() {
        return validate(this, NAME)[SIZE];
      }
    });
    return C;
  },
  def: function def(that, key, value) {
    var entry = getEntry(that, key);
    var prev, index;
    // change existing entry
    if (entry) {
      entry.v = value;
      // create new entry
    } else {
      that._l = entry = {
        i: index = fastKey(key, true), // <- index
        k: key, // <- key
        v: value, // <- value
        p: prev = that._l, // <- previous entry
        n: undefined, // <- next entry
        r: false // <- removed
      };
      if (!that._f) that._f = entry;
      if (prev) prev.n = entry;
      that[SIZE]++;
      // add to index
      if (index !== 'F') that._i[index] = entry;
    }return that;
  },
  getEntry: getEntry,
  setStrong: function setStrong(C, NAME, IS_MAP) {
    // add .keys, .values, .entries, [@@iterator]
    // 23.1.3.4, 23.1.3.8, 23.1.3.11, 23.1.3.12, 23.2.3.5, 23.2.3.8, 23.2.3.10, 23.2.3.11
    $iterDefine(C, NAME, function (iterated, kind) {
      this._t = validate(iterated, NAME); // target
      this._k = kind; // kind
      this._l = undefined; // previous
    }, function () {
      var that = this;
      var kind = that._k;
      var entry = that._l;
      // revert to the last existing entry
      while (entry && entry.r) {
        entry = entry.p;
      } // get next entry
      if (!that._t || !(that._l = entry = entry ? entry.n : that._t._f)) {
        // or finish the iteration
        that._t = undefined;
        return step(1);
      }
      // return step by kind
      if (kind == 'keys') return step(0, entry.k);
      if (kind == 'values') return step(0, entry.v);
      return step(0, [entry.k, entry.v]);
    }, IS_MAP ? 'entries' : 'values', !IS_MAP, true);

    // add [@@species], 23.1.2.2, 23.2.2.2
    setSpecies(NAME);
  }
};

},{"./_an-instance":232,"./_ctx":251,"./_descriptors":255,"./_for-of":265,"./_iter-define":281,"./_iter-step":283,"./_meta":291,"./_object-create":296,"./_object-dp":297,"./_redefine-all":316,"./_set-species":323,"./_validate-collection":349}],246:[function(require,module,exports){
'use strict';

// https://github.com/DavidBruant/Map-Set.prototype.toJSON
var classof = require('./_classof');
var from = require('./_array-from-iterable');
module.exports = function (NAME) {
  return function toJSON() {
    if (classof(this) != NAME) throw TypeError(NAME + "#toJSON isn't generic");
    return from(this);
  };
};

},{"./_array-from-iterable":236,"./_classof":243}],247:[function(require,module,exports){
'use strict';

var redefineAll = require('./_redefine-all');
var getWeak = require('./_meta').getWeak;
var anObject = require('./_an-object');
var isObject = require('./_is-object');
var anInstance = require('./_an-instance');
var forOf = require('./_for-of');
var createArrayMethod = require('./_array-methods');
var $has = require('./_has');
var validate = require('./_validate-collection');
var arrayFind = createArrayMethod(5);
var arrayFindIndex = createArrayMethod(6);
var id = 0;

// fallback for uncaught frozen keys
var uncaughtFrozenStore = function uncaughtFrozenStore(that) {
  return that._l || (that._l = new UncaughtFrozenStore());
};
var UncaughtFrozenStore = function UncaughtFrozenStore() {
  this.a = [];
};
var findUncaughtFrozen = function findUncaughtFrozen(store, key) {
  return arrayFind(store.a, function (it) {
    return it[0] === key;
  });
};
UncaughtFrozenStore.prototype = {
  get: function get(key) {
    var entry = findUncaughtFrozen(this, key);
    if (entry) return entry[1];
  },
  has: function has(key) {
    return !!findUncaughtFrozen(this, key);
  },
  set: function set(key, value) {
    var entry = findUncaughtFrozen(this, key);
    if (entry) entry[1] = value;else this.a.push([key, value]);
  },
  'delete': function _delete(key) {
    var index = arrayFindIndex(this.a, function (it) {
      return it[0] === key;
    });
    if (~index) this.a.splice(index, 1);
    return !!~index;
  }
};

module.exports = {
  getConstructor: function getConstructor(wrapper, NAME, IS_MAP, ADDER) {
    var C = wrapper(function (that, iterable) {
      anInstance(that, C, NAME, '_i');
      that._t = NAME; // collection type
      that._i = id++; // collection id
      that._l = undefined; // leak store for uncaught frozen objects
      if (iterable != undefined) forOf(iterable, IS_MAP, that[ADDER], that);
    });
    redefineAll(C.prototype, {
      // 23.3.3.2 WeakMap.prototype.delete(key)
      // 23.4.3.3 WeakSet.prototype.delete(value)
      'delete': function _delete(key) {
        if (!isObject(key)) return false;
        var data = getWeak(key);
        if (data === true) return uncaughtFrozenStore(validate(this, NAME))['delete'](key);
        return data && $has(data, this._i) && delete data[this._i];
      },
      // 23.3.3.4 WeakMap.prototype.has(key)
      // 23.4.3.4 WeakSet.prototype.has(value)
      has: function has(key) {
        if (!isObject(key)) return false;
        var data = getWeak(key);
        if (data === true) return uncaughtFrozenStore(validate(this, NAME)).has(key);
        return data && $has(data, this._i);
      }
    });
    return C;
  },
  def: function def(that, key, value) {
    var data = getWeak(anObject(key), true);
    if (data === true) uncaughtFrozenStore(that).set(key, value);else data[that._i] = value;
    return that;
  },
  ufstore: uncaughtFrozenStore
};

},{"./_an-instance":232,"./_an-object":233,"./_array-methods":238,"./_for-of":265,"./_has":267,"./_is-object":277,"./_meta":291,"./_redefine-all":316,"./_validate-collection":349}],248:[function(require,module,exports){
'use strict';

var global = require('./_global');
var $export = require('./_export');
var redefine = require('./_redefine');
var redefineAll = require('./_redefine-all');
var meta = require('./_meta');
var forOf = require('./_for-of');
var anInstance = require('./_an-instance');
var isObject = require('./_is-object');
var fails = require('./_fails');
var $iterDetect = require('./_iter-detect');
var setToStringTag = require('./_set-to-string-tag');
var inheritIfRequired = require('./_inherit-if-required');

module.exports = function (NAME, wrapper, methods, common, IS_MAP, IS_WEAK) {
  var Base = global[NAME];
  var C = Base;
  var ADDER = IS_MAP ? 'set' : 'add';
  var proto = C && C.prototype;
  var O = {};
  var fixMethod = function fixMethod(KEY) {
    var fn = proto[KEY];
    redefine(proto, KEY, KEY == 'delete' ? function (a) {
      return IS_WEAK && !isObject(a) ? false : fn.call(this, a === 0 ? 0 : a);
    } : KEY == 'has' ? function has(a) {
      return IS_WEAK && !isObject(a) ? false : fn.call(this, a === 0 ? 0 : a);
    } : KEY == 'get' ? function get(a) {
      return IS_WEAK && !isObject(a) ? undefined : fn.call(this, a === 0 ? 0 : a);
    } : KEY == 'add' ? function add(a) {
      fn.call(this, a === 0 ? 0 : a);return this;
    } : function set(a, b) {
      fn.call(this, a === 0 ? 0 : a, b);return this;
    });
  };
  if (typeof C != 'function' || !(IS_WEAK || proto.forEach && !fails(function () {
    new C().entries().next();
  }))) {
    // create collection constructor
    C = common.getConstructor(wrapper, NAME, IS_MAP, ADDER);
    redefineAll(C.prototype, methods);
    meta.NEED = true;
  } else {
    var instance = new C();
    // early implementations not supports chaining
    var HASNT_CHAINING = instance[ADDER](IS_WEAK ? {} : -0, 1) != instance;
    // V8 ~  Chromium 40- weak-collections throws on primitives, but should return false
    var THROWS_ON_PRIMITIVES = fails(function () {
      instance.has(1);
    });
    // most early implementations doesn't supports iterables, most modern - not close it correctly
    var ACCEPT_ITERABLES = $iterDetect(function (iter) {
      new C(iter);
    }); // eslint-disable-line no-new
    // for early implementations -0 and +0 not the same
    var BUGGY_ZERO = !IS_WEAK && fails(function () {
      // V8 ~ Chromium 42- fails only with 5+ elements
      var $instance = new C();
      var index = 5;
      while (index--) {
        $instance[ADDER](index, index);
      }return !$instance.has(-0);
    });
    if (!ACCEPT_ITERABLES) {
      C = wrapper(function (target, iterable) {
        anInstance(target, C, NAME);
        var that = inheritIfRequired(new Base(), target, C);
        if (iterable != undefined) forOf(iterable, IS_MAP, that[ADDER], that);
        return that;
      });
      C.prototype = proto;
      proto.constructor = C;
    }
    if (THROWS_ON_PRIMITIVES || BUGGY_ZERO) {
      fixMethod('delete');
      fixMethod('has');
      IS_MAP && fixMethod('get');
    }
    if (BUGGY_ZERO || HASNT_CHAINING) fixMethod(ADDER);
    // weak collections should not contains .clear method
    if (IS_WEAK && proto.clear) delete proto.clear;
  }

  setToStringTag(C, NAME);

  O[NAME] = C;
  $export($export.G + $export.W + $export.F * (C != Base), O);

  if (!IS_WEAK) common.setStrong(C, NAME, IS_MAP);

  return C;
};

},{"./_an-instance":232,"./_export":259,"./_fails":261,"./_for-of":265,"./_global":266,"./_inherit-if-required":271,"./_is-object":277,"./_iter-detect":282,"./_meta":291,"./_redefine":317,"./_redefine-all":316,"./_set-to-string-tag":324}],249:[function(require,module,exports){
arguments[4][142][0].apply(exports,arguments)
},{"dup":142}],250:[function(require,module,exports){
arguments[4][143][0].apply(exports,arguments)
},{"./_object-dp":297,"./_property-desc":315,"dup":143}],251:[function(require,module,exports){
arguments[4][144][0].apply(exports,arguments)
},{"./_a-function":229,"dup":144}],252:[function(require,module,exports){
'use strict';
// 20.3.4.36 / 15.9.5.43 Date.prototype.toISOString()

var fails = require('./_fails');
var getTime = Date.prototype.getTime;
var $toISOString = Date.prototype.toISOString;

var lz = function lz(num) {
  return num > 9 ? num : '0' + num;
};

// PhantomJS / old WebKit has a broken implementations
module.exports = fails(function () {
  return $toISOString.call(new Date(-5e13 - 1)) != '0385-07-25T07:06:39.999Z';
}) || !fails(function () {
  $toISOString.call(new Date(NaN));
}) ? function toISOString() {
  if (!isFinite(getTime.call(this))) throw RangeError('Invalid time value');
  var d = this;
  var y = d.getUTCFullYear();
  var m = d.getUTCMilliseconds();
  var s = y < 0 ? '-' : y > 9999 ? '+' : '';
  return s + ('00000' + Math.abs(y)).slice(s ? -6 : -4) + '-' + lz(d.getUTCMonth() + 1) + '-' + lz(d.getUTCDate()) + 'T' + lz(d.getUTCHours()) + ':' + lz(d.getUTCMinutes()) + ':' + lz(d.getUTCSeconds()) + '.' + (m > 99 ? m : '0' + lz(m)) + 'Z';
} : $toISOString;

},{"./_fails":261}],253:[function(require,module,exports){
'use strict';

var anObject = require('./_an-object');
var toPrimitive = require('./_to-primitive');
var NUMBER = 'number';

module.exports = function (hint) {
  if (hint !== 'string' && hint !== NUMBER && hint !== 'default') throw TypeError('Incorrect hint');
  return toPrimitive(anObject(this), hint != NUMBER);
};

},{"./_an-object":233,"./_to-primitive":343}],254:[function(require,module,exports){
arguments[4][145][0].apply(exports,arguments)
},{"dup":145}],255:[function(require,module,exports){
arguments[4][146][0].apply(exports,arguments)
},{"./_fails":261,"dup":146}],256:[function(require,module,exports){
arguments[4][147][0].apply(exports,arguments)
},{"./_global":266,"./_is-object":277,"dup":147}],257:[function(require,module,exports){
arguments[4][148][0].apply(exports,arguments)
},{"dup":148}],258:[function(require,module,exports){
arguments[4][149][0].apply(exports,arguments)
},{"./_object-gops":303,"./_object-keys":306,"./_object-pie":307,"dup":149}],259:[function(require,module,exports){
'use strict';

var global = require('./_global');
var core = require('./_core');
var hide = require('./_hide');
var redefine = require('./_redefine');
var ctx = require('./_ctx');
var PROTOTYPE = 'prototype';

var $export = function $export(type, name, source) {
  var IS_FORCED = type & $export.F;
  var IS_GLOBAL = type & $export.G;
  var IS_STATIC = type & $export.S;
  var IS_PROTO = type & $export.P;
  var IS_BIND = type & $export.B;
  var target = IS_GLOBAL ? global : IS_STATIC ? global[name] || (global[name] = {}) : (global[name] || {})[PROTOTYPE];
  var exports = IS_GLOBAL ? core : core[name] || (core[name] = {});
  var expProto = exports[PROTOTYPE] || (exports[PROTOTYPE] = {});
  var key, own, out, exp;
  if (IS_GLOBAL) source = name;
  for (key in source) {
    // contains in native
    own = !IS_FORCED && target && target[key] !== undefined;
    // export native or passed
    out = (own ? target : source)[key];
    // bind timers to global for call from export context
    exp = IS_BIND && own ? ctx(out, global) : IS_PROTO && typeof out == 'function' ? ctx(Function.call, out) : out;
    // extend global
    if (target) redefine(target, key, out, type & $export.U);
    // export
    if (exports[key] != out) hide(exports, key, exp);
    if (IS_PROTO && expProto[key] != out) expProto[key] = out;
  }
};
global.core = core;
// type bitmap
$export.F = 1; // forced
$export.G = 2; // global
$export.S = 4; // static
$export.P = 8; // proto
$export.B = 16; // bind
$export.W = 32; // wrap
$export.U = 64; // safe
$export.R = 128; // real proto method for `library`
module.exports = $export;

},{"./_core":249,"./_ctx":251,"./_global":266,"./_hide":268,"./_redefine":317}],260:[function(require,module,exports){
'use strict';

var MATCH = require('./_wks')('match');
module.exports = function (KEY) {
  var re = /./;
  try {
    '/./'[KEY](re);
  } catch (e) {
    try {
      re[MATCH] = false;
      return !'/./'[KEY](re);
    } catch (f) {/* empty */}
  }return true;
};

},{"./_wks":352}],261:[function(require,module,exports){
arguments[4][151][0].apply(exports,arguments)
},{"dup":151}],262:[function(require,module,exports){
'use strict';

var hide = require('./_hide');
var redefine = require('./_redefine');
var fails = require('./_fails');
var defined = require('./_defined');
var wks = require('./_wks');

module.exports = function (KEY, length, exec) {
  var SYMBOL = wks(KEY);
  var fns = exec(defined, SYMBOL, ''[KEY]);
  var strfn = fns[0];
  var rxfn = fns[1];
  if (fails(function () {
    var O = {};
    O[SYMBOL] = function () {
      return 7;
    };
    return ''[KEY](O) != 7;
  })) {
    redefine(String.prototype, KEY, strfn);
    hide(RegExp.prototype, SYMBOL, length == 2
    // 21.2.5.8 RegExp.prototype[@@replace](string, replaceValue)
    // 21.2.5.11 RegExp.prototype[@@split](string, limit)
    ? function (string, arg) {
      return rxfn.call(string, this, arg);
    }
    // 21.2.5.6 RegExp.prototype[@@match](string)
    // 21.2.5.9 RegExp.prototype[@@search](string)
    : function (string) {
      return rxfn.call(string, this);
    });
  }
};

},{"./_defined":254,"./_fails":261,"./_hide":268,"./_redefine":317,"./_wks":352}],263:[function(require,module,exports){
'use strict';
// 21.2.5.3 get RegExp.prototype.flags

var anObject = require('./_an-object');
module.exports = function () {
  var that = anObject(this);
  var result = '';
  if (that.global) result += 'g';
  if (that.ignoreCase) result += 'i';
  if (that.multiline) result += 'm';
  if (that.unicode) result += 'u';
  if (that.sticky) result += 'y';
  return result;
};

},{"./_an-object":233}],264:[function(require,module,exports){
'use strict';
// https://tc39.github.io/proposal-flatMap/#sec-FlattenIntoArray

var isArray = require('./_is-array');
var isObject = require('./_is-object');
var toLength = require('./_to-length');
var ctx = require('./_ctx');
var IS_CONCAT_SPREADABLE = require('./_wks')('isConcatSpreadable');

function flattenIntoArray(target, original, source, sourceLen, start, depth, mapper, thisArg) {
  var targetIndex = start;
  var sourceIndex = 0;
  var mapFn = mapper ? ctx(mapper, thisArg, 3) : false;
  var element, spreadable;

  while (sourceIndex < sourceLen) {
    if (sourceIndex in source) {
      element = mapFn ? mapFn(source[sourceIndex], sourceIndex, original) : source[sourceIndex];

      spreadable = false;
      if (isObject(element)) {
        spreadable = element[IS_CONCAT_SPREADABLE];
        spreadable = spreadable !== undefined ? !!spreadable : isArray(element);
      }

      if (spreadable && depth > 0) {
        targetIndex = flattenIntoArray(target, original, element, toLength(element.length), targetIndex, depth - 1) - 1;
      } else {
        if (targetIndex >= 0x1fffffffffffff) throw TypeError();
        target[targetIndex] = element;
      }

      targetIndex++;
    }
    sourceIndex++;
  }
  return targetIndex;
}

module.exports = flattenIntoArray;

},{"./_ctx":251,"./_is-array":275,"./_is-object":277,"./_to-length":341,"./_wks":352}],265:[function(require,module,exports){
arguments[4][152][0].apply(exports,arguments)
},{"./_an-object":233,"./_ctx":251,"./_is-array-iter":274,"./_iter-call":279,"./_to-length":341,"./core.get-iterator-method":353,"dup":152}],266:[function(require,module,exports){
arguments[4][153][0].apply(exports,arguments)
},{"dup":153}],267:[function(require,module,exports){
arguments[4][154][0].apply(exports,arguments)
},{"dup":154}],268:[function(require,module,exports){
arguments[4][155][0].apply(exports,arguments)
},{"./_descriptors":255,"./_object-dp":297,"./_property-desc":315,"dup":155}],269:[function(require,module,exports){
arguments[4][156][0].apply(exports,arguments)
},{"./_global":266,"dup":156}],270:[function(require,module,exports){
arguments[4][157][0].apply(exports,arguments)
},{"./_descriptors":255,"./_dom-create":256,"./_fails":261,"dup":157}],271:[function(require,module,exports){
'use strict';

var isObject = require('./_is-object');
var setPrototypeOf = require('./_set-proto').set;
module.exports = function (that, target, C) {
  var S = target.constructor;
  var P;
  if (S !== C && typeof S == 'function' && (P = S.prototype) !== C.prototype && isObject(P) && setPrototypeOf) {
    setPrototypeOf(that, P);
  }return that;
};

},{"./_is-object":277,"./_set-proto":322}],272:[function(require,module,exports){
arguments[4][158][0].apply(exports,arguments)
},{"dup":158}],273:[function(require,module,exports){
arguments[4][159][0].apply(exports,arguments)
},{"./_cof":244,"dup":159}],274:[function(require,module,exports){
arguments[4][160][0].apply(exports,arguments)
},{"./_iterators":284,"./_wks":352,"dup":160}],275:[function(require,module,exports){
arguments[4][161][0].apply(exports,arguments)
},{"./_cof":244,"dup":161}],276:[function(require,module,exports){
'use strict';

// 20.1.2.3 Number.isInteger(number)
var isObject = require('./_is-object');
var floor = Math.floor;
module.exports = function isInteger(it) {
  return !isObject(it) && isFinite(it) && floor(it) === it;
};

},{"./_is-object":277}],277:[function(require,module,exports){
arguments[4][162][0].apply(exports,arguments)
},{"dup":162}],278:[function(require,module,exports){
'use strict';

// 7.2.8 IsRegExp(argument)
var isObject = require('./_is-object');
var cof = require('./_cof');
var MATCH = require('./_wks')('match');
module.exports = function (it) {
  var isRegExp;
  return isObject(it) && ((isRegExp = it[MATCH]) !== undefined ? !!isRegExp : cof(it) == 'RegExp');
};

},{"./_cof":244,"./_is-object":277,"./_wks":352}],279:[function(require,module,exports){
arguments[4][163][0].apply(exports,arguments)
},{"./_an-object":233,"dup":163}],280:[function(require,module,exports){
arguments[4][164][0].apply(exports,arguments)
},{"./_hide":268,"./_object-create":296,"./_property-desc":315,"./_set-to-string-tag":324,"./_wks":352,"dup":164}],281:[function(require,module,exports){
arguments[4][165][0].apply(exports,arguments)
},{"./_export":259,"./_hide":268,"./_iter-create":280,"./_iterators":284,"./_library":285,"./_object-gpo":304,"./_redefine":317,"./_set-to-string-tag":324,"./_wks":352,"dup":165}],282:[function(require,module,exports){
arguments[4][166][0].apply(exports,arguments)
},{"./_wks":352,"dup":166}],283:[function(require,module,exports){
arguments[4][167][0].apply(exports,arguments)
},{"dup":167}],284:[function(require,module,exports){
arguments[4][168][0].apply(exports,arguments)
},{"dup":168}],285:[function(require,module,exports){
"use strict";

module.exports = false;

},{}],286:[function(require,module,exports){
"use strict";

// 20.2.2.14 Math.expm1(x)
var $expm1 = Math.expm1;
module.exports = !$expm1
// Old FF bug
|| $expm1(10) > 22025.465794806719 || $expm1(10) < 22025.4657948067165168
// Tor Browser bug
|| $expm1(-2e-17) != -2e-17 ? function expm1(x) {
  return (x = +x) == 0 ? x : x > -1e-6 && x < 1e-6 ? x + x * x / 2 : Math.exp(x) - 1;
} : $expm1;

},{}],287:[function(require,module,exports){
'use strict';

// 20.2.2.16 Math.fround(x)
var sign = require('./_math-sign');
var pow = Math.pow;
var EPSILON = pow(2, -52);
var EPSILON32 = pow(2, -23);
var MAX32 = pow(2, 127) * (2 - EPSILON32);
var MIN32 = pow(2, -126);

var roundTiesToEven = function roundTiesToEven(n) {
  return n + 1 / EPSILON - 1 / EPSILON;
};

module.exports = Math.fround || function fround(x) {
  var $abs = Math.abs(x);
  var $sign = sign(x);
  var a, result;
  if ($abs < MIN32) return $sign * roundTiesToEven($abs / MIN32 / EPSILON32) * MIN32 * EPSILON32;
  a = (1 + EPSILON32 / EPSILON) * $abs;
  result = a - (a - $abs);
  // eslint-disable-next-line no-self-compare
  if (result > MAX32 || result != result) return $sign * Infinity;
  return $sign * result;
};

},{"./_math-sign":290}],288:[function(require,module,exports){
"use strict";

// 20.2.2.20 Math.log1p(x)
module.exports = Math.log1p || function log1p(x) {
  return (x = +x) > -1e-8 && x < 1e-8 ? x - x * x / 2 : Math.log(1 + x);
};

},{}],289:[function(require,module,exports){
"use strict";

// https://rwaldron.github.io/proposal-math-extensions/
module.exports = Math.scale || function scale(x, inLow, inHigh, outLow, outHigh) {
  if (arguments.length === 0
  // eslint-disable-next-line no-self-compare
  || x != x
  // eslint-disable-next-line no-self-compare
  || inLow != inLow
  // eslint-disable-next-line no-self-compare
  || inHigh != inHigh
  // eslint-disable-next-line no-self-compare
  || outLow != outLow
  // eslint-disable-next-line no-self-compare
  || outHigh != outHigh) return NaN;
  if (x === Infinity || x === -Infinity) return x;
  return (x - inLow) * (outHigh - outLow) / (inHigh - inLow) + outLow;
};

},{}],290:[function(require,module,exports){
"use strict";

// 20.2.2.28 Math.sign(x)
module.exports = Math.sign || function sign(x) {
  // eslint-disable-next-line no-self-compare
  return (x = +x) == 0 || x != x ? x : x < 0 ? -1 : 1;
};

},{}],291:[function(require,module,exports){
arguments[4][170][0].apply(exports,arguments)
},{"./_fails":261,"./_has":267,"./_is-object":277,"./_object-dp":297,"./_uid":347,"dup":170}],292:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var Map = require('./es6.map');
var $export = require('./_export');
var shared = require('./_shared')('metadata');
var store = shared.store || (shared.store = new (require('./es6.weak-map'))());

var getOrCreateMetadataMap = function getOrCreateMetadataMap(target, targetKey, create) {
  var targetMetadata = store.get(target);
  if (!targetMetadata) {
    if (!create) return undefined;
    store.set(target, targetMetadata = new Map());
  }
  var keyMetadata = targetMetadata.get(targetKey);
  if (!keyMetadata) {
    if (!create) return undefined;
    targetMetadata.set(targetKey, keyMetadata = new Map());
  }return keyMetadata;
};
var ordinaryHasOwnMetadata = function ordinaryHasOwnMetadata(MetadataKey, O, P) {
  var metadataMap = getOrCreateMetadataMap(O, P, false);
  return metadataMap === undefined ? false : metadataMap.has(MetadataKey);
};
var ordinaryGetOwnMetadata = function ordinaryGetOwnMetadata(MetadataKey, O, P) {
  var metadataMap = getOrCreateMetadataMap(O, P, false);
  return metadataMap === undefined ? undefined : metadataMap.get(MetadataKey);
};
var ordinaryDefineOwnMetadata = function ordinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P) {
  getOrCreateMetadataMap(O, P, true).set(MetadataKey, MetadataValue);
};
var ordinaryOwnMetadataKeys = function ordinaryOwnMetadataKeys(target, targetKey) {
  var metadataMap = getOrCreateMetadataMap(target, targetKey, false);
  var keys = [];
  if (metadataMap) metadataMap.forEach(function (_, key) {
    keys.push(key);
  });
  return keys;
};
var toMetaKey = function toMetaKey(it) {
  return it === undefined || (typeof it === 'undefined' ? 'undefined' : _typeof(it)) == 'symbol' ? it : String(it);
};
var exp = function exp(O) {
  $export($export.S, 'Reflect', O);
};

module.exports = {
  store: store,
  map: getOrCreateMetadataMap,
  has: ordinaryHasOwnMetadata,
  get: ordinaryGetOwnMetadata,
  set: ordinaryDefineOwnMetadata,
  keys: ordinaryOwnMetadataKeys,
  key: toMetaKey,
  exp: exp
};

},{"./_export":259,"./_shared":326,"./es6.map":384,"./es6.weak-map":490}],293:[function(require,module,exports){
arguments[4][171][0].apply(exports,arguments)
},{"./_cof":244,"./_global":266,"./_task":336,"dup":171}],294:[function(require,module,exports){
arguments[4][172][0].apply(exports,arguments)
},{"./_a-function":229,"dup":172}],295:[function(require,module,exports){
arguments[4][173][0].apply(exports,arguments)
},{"./_fails":261,"./_iobject":273,"./_object-gops":303,"./_object-keys":306,"./_object-pie":307,"./_to-object":342,"dup":173}],296:[function(require,module,exports){
arguments[4][174][0].apply(exports,arguments)
},{"./_an-object":233,"./_dom-create":256,"./_enum-bug-keys":257,"./_html":269,"./_object-dps":298,"./_shared-key":325,"dup":174}],297:[function(require,module,exports){
arguments[4][175][0].apply(exports,arguments)
},{"./_an-object":233,"./_descriptors":255,"./_ie8-dom-define":270,"./_to-primitive":343,"dup":175}],298:[function(require,module,exports){
arguments[4][176][0].apply(exports,arguments)
},{"./_an-object":233,"./_descriptors":255,"./_object-dp":297,"./_object-keys":306,"dup":176}],299:[function(require,module,exports){
'use strict';
// Forced replacement prototype accessors methods

module.exports = require('./_library') || !require('./_fails')(function () {
  var K = Math.random();
  // In FF throws only define methods
  // eslint-disable-next-line no-undef, no-useless-call
  __defineSetter__.call(null, K, function () {/* empty */});
  delete require('./_global')[K];
});

},{"./_fails":261,"./_global":266,"./_library":285}],300:[function(require,module,exports){
arguments[4][177][0].apply(exports,arguments)
},{"./_descriptors":255,"./_has":267,"./_ie8-dom-define":270,"./_object-pie":307,"./_property-desc":315,"./_to-iobject":340,"./_to-primitive":343,"dup":177}],301:[function(require,module,exports){
arguments[4][178][0].apply(exports,arguments)
},{"./_object-gopn":302,"./_to-iobject":340,"dup":178}],302:[function(require,module,exports){
arguments[4][179][0].apply(exports,arguments)
},{"./_enum-bug-keys":257,"./_object-keys-internal":305,"dup":179}],303:[function(require,module,exports){
arguments[4][180][0].apply(exports,arguments)
},{"dup":180}],304:[function(require,module,exports){
arguments[4][181][0].apply(exports,arguments)
},{"./_has":267,"./_shared-key":325,"./_to-object":342,"dup":181}],305:[function(require,module,exports){
arguments[4][182][0].apply(exports,arguments)
},{"./_array-includes":237,"./_has":267,"./_shared-key":325,"./_to-iobject":340,"dup":182}],306:[function(require,module,exports){
arguments[4][183][0].apply(exports,arguments)
},{"./_enum-bug-keys":257,"./_object-keys-internal":305,"dup":183}],307:[function(require,module,exports){
arguments[4][184][0].apply(exports,arguments)
},{"dup":184}],308:[function(require,module,exports){
arguments[4][185][0].apply(exports,arguments)
},{"./_core":249,"./_export":259,"./_fails":261,"dup":185}],309:[function(require,module,exports){
'use strict';

var getKeys = require('./_object-keys');
var toIObject = require('./_to-iobject');
var isEnum = require('./_object-pie').f;
module.exports = function (isEntries) {
  return function (it) {
    var O = toIObject(it);
    var keys = getKeys(O);
    var length = keys.length;
    var i = 0;
    var result = [];
    var key;
    while (length > i) {
      if (isEnum.call(O, key = keys[i++])) {
        result.push(isEntries ? [key, O[key]] : O[key]);
      }
    }return result;
  };
};

},{"./_object-keys":306,"./_object-pie":307,"./_to-iobject":340}],310:[function(require,module,exports){
'use strict';

// all object keys, includes non-enumerable and symbols
var gOPN = require('./_object-gopn');
var gOPS = require('./_object-gops');
var anObject = require('./_an-object');
var Reflect = require('./_global').Reflect;
module.exports = Reflect && Reflect.ownKeys || function ownKeys(it) {
  var keys = gOPN.f(anObject(it));
  var getSymbols = gOPS.f;
  return getSymbols ? keys.concat(getSymbols(it)) : keys;
};

},{"./_an-object":233,"./_global":266,"./_object-gopn":302,"./_object-gops":303}],311:[function(require,module,exports){
'use strict';

var $parseFloat = require('./_global').parseFloat;
var $trim = require('./_string-trim').trim;

module.exports = 1 / $parseFloat(require('./_string-ws') + '-0') !== -Infinity ? function parseFloat(str) {
  var string = $trim(String(str), 3);
  var result = $parseFloat(string);
  return result === 0 && string.charAt(0) == '-' ? -0 : result;
} : $parseFloat;

},{"./_global":266,"./_string-trim":334,"./_string-ws":335}],312:[function(require,module,exports){
'use strict';

var $parseInt = require('./_global').parseInt;
var $trim = require('./_string-trim').trim;
var ws = require('./_string-ws');
var hex = /^[-+]?0[xX]/;

module.exports = $parseInt(ws + '08') !== 8 || $parseInt(ws + '0x16') !== 22 ? function parseInt(str, radix) {
  var string = $trim(String(str), 3);
  return $parseInt(string, radix >>> 0 || (hex.test(string) ? 16 : 10));
} : $parseInt;

},{"./_global":266,"./_string-trim":334,"./_string-ws":335}],313:[function(require,module,exports){
arguments[4][186][0].apply(exports,arguments)
},{"dup":186}],314:[function(require,module,exports){
arguments[4][187][0].apply(exports,arguments)
},{"./_an-object":233,"./_is-object":277,"./_new-promise-capability":294,"dup":187}],315:[function(require,module,exports){
arguments[4][188][0].apply(exports,arguments)
},{"dup":188}],316:[function(require,module,exports){
'use strict';

var redefine = require('./_redefine');
module.exports = function (target, src, safe) {
  for (var key in src) {
    redefine(target, key, src[key], safe);
  }return target;
};

},{"./_redefine":317}],317:[function(require,module,exports){
'use strict';

var global = require('./_global');
var hide = require('./_hide');
var has = require('./_has');
var SRC = require('./_uid')('src');
var TO_STRING = 'toString';
var $toString = Function[TO_STRING];
var TPL = ('' + $toString).split(TO_STRING);

require('./_core').inspectSource = function (it) {
  return $toString.call(it);
};

(module.exports = function (O, key, val, safe) {
  var isFunction = typeof val == 'function';
  if (isFunction) has(val, 'name') || hide(val, 'name', key);
  if (O[key] === val) return;
  if (isFunction) has(val, SRC) || hide(val, SRC, O[key] ? '' + O[key] : TPL.join(String(key)));
  if (O === global) {
    O[key] = val;
  } else if (!safe) {
    delete O[key];
    hide(O, key, val);
  } else if (O[key]) {
    O[key] = val;
  } else {
    hide(O, key, val);
  }
  // add fake Function#toString for correct work wrapped methods / constructors with methods like LoDash isNative
})(Function.prototype, TO_STRING, function toString() {
  return typeof this == 'function' && this[SRC] || $toString.call(this);
});

},{"./_core":249,"./_global":266,"./_has":267,"./_hide":268,"./_uid":347}],318:[function(require,module,exports){
"use strict";

module.exports = function (regExp, replace) {
  var replacer = replace === Object(replace) ? function (part) {
    return replace[part];
  } : replace;
  return function (it) {
    return String(it).replace(regExp, replacer);
  };
};

},{}],319:[function(require,module,exports){
"use strict";

// 7.2.9 SameValue(x, y)
module.exports = Object.is || function is(x, y) {
  // eslint-disable-next-line no-self-compare
  return x === y ? x !== 0 || 1 / x === 1 / y : x != x && y != y;
};

},{}],320:[function(require,module,exports){
'use strict';
// https://tc39.github.io/proposal-setmap-offrom/

var $export = require('./_export');
var aFunction = require('./_a-function');
var ctx = require('./_ctx');
var forOf = require('./_for-of');

module.exports = function (COLLECTION) {
  $export($export.S, COLLECTION, { from: function from(source /* , mapFn, thisArg */) {
      var mapFn = arguments[1];
      var mapping, A, n, cb;
      aFunction(this);
      mapping = mapFn !== undefined;
      if (mapping) aFunction(mapFn);
      if (source == undefined) return new this();
      A = [];
      if (mapping) {
        n = 0;
        cb = ctx(mapFn, arguments[2], 2);
        forOf(source, false, function (nextItem) {
          A.push(cb(nextItem, n++));
        });
      } else {
        forOf(source, false, A.push, A);
      }
      return new this(A);
    } });
};

},{"./_a-function":229,"./_ctx":251,"./_export":259,"./_for-of":265}],321:[function(require,module,exports){
'use strict';
// https://tc39.github.io/proposal-setmap-offrom/

var $export = require('./_export');

module.exports = function (COLLECTION) {
  $export($export.S, COLLECTION, { of: function of() {
      var length = arguments.length;
      var A = new Array(length);
      while (length--) {
        A[length] = arguments[length];
      }return new this(A);
    } });
};

},{"./_export":259}],322:[function(require,module,exports){
arguments[4][191][0].apply(exports,arguments)
},{"./_an-object":233,"./_ctx":251,"./_is-object":277,"./_object-gopd":300,"dup":191}],323:[function(require,module,exports){
'use strict';

var global = require('./_global');
var dP = require('./_object-dp');
var DESCRIPTORS = require('./_descriptors');
var SPECIES = require('./_wks')('species');

module.exports = function (KEY) {
  var C = global[KEY];
  if (DESCRIPTORS && C && !C[SPECIES]) dP.f(C, SPECIES, {
    configurable: true,
    get: function get() {
      return this;
    }
  });
};

},{"./_descriptors":255,"./_global":266,"./_object-dp":297,"./_wks":352}],324:[function(require,module,exports){
arguments[4][193][0].apply(exports,arguments)
},{"./_has":267,"./_object-dp":297,"./_wks":352,"dup":193}],325:[function(require,module,exports){
arguments[4][194][0].apply(exports,arguments)
},{"./_shared":326,"./_uid":347,"dup":194}],326:[function(require,module,exports){
arguments[4][195][0].apply(exports,arguments)
},{"./_core":249,"./_global":266,"./_library":285,"dup":195}],327:[function(require,module,exports){
arguments[4][196][0].apply(exports,arguments)
},{"./_a-function":229,"./_an-object":233,"./_wks":352,"dup":196}],328:[function(require,module,exports){
'use strict';

var fails = require('./_fails');

module.exports = function (method, arg) {
  return !!method && fails(function () {
    // eslint-disable-next-line no-useless-call
    arg ? method.call(null, function () {/* empty */}, 1) : method.call(null);
  });
};

},{"./_fails":261}],329:[function(require,module,exports){
arguments[4][197][0].apply(exports,arguments)
},{"./_defined":254,"./_to-integer":339,"dup":197}],330:[function(require,module,exports){
'use strict';

// helper for String#{startsWith, endsWith, includes}
var isRegExp = require('./_is-regexp');
var defined = require('./_defined');

module.exports = function (that, searchString, NAME) {
  if (isRegExp(searchString)) throw TypeError('String#' + NAME + " doesn't accept regex!");
  return String(defined(that));
};

},{"./_defined":254,"./_is-regexp":278}],331:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var fails = require('./_fails');
var defined = require('./_defined');
var quot = /"/g;
// B.2.3.2.1 CreateHTML(string, tag, attribute, value)
var createHTML = function createHTML(string, tag, attribute, value) {
  var S = String(defined(string));
  var p1 = '<' + tag;
  if (attribute !== '') p1 += ' ' + attribute + '="' + String(value).replace(quot, '&quot;') + '"';
  return p1 + '>' + S + '</' + tag + '>';
};
module.exports = function (NAME, exec) {
  var O = {};
  O[NAME] = exec(createHTML);
  $export($export.P + $export.F * fails(function () {
    var test = ''[NAME]('"');
    return test !== test.toLowerCase() || test.split('"').length > 3;
  }), 'String', O);
};

},{"./_defined":254,"./_export":259,"./_fails":261}],332:[function(require,module,exports){
'use strict';

// https://github.com/tc39/proposal-string-pad-start-end
var toLength = require('./_to-length');
var repeat = require('./_string-repeat');
var defined = require('./_defined');

module.exports = function (that, maxLength, fillString, left) {
  var S = String(defined(that));
  var stringLength = S.length;
  var fillStr = fillString === undefined ? ' ' : String(fillString);
  var intMaxLength = toLength(maxLength);
  if (intMaxLength <= stringLength || fillStr == '') return S;
  var fillLen = intMaxLength - stringLength;
  var stringFiller = repeat.call(fillStr, Math.ceil(fillLen / fillStr.length));
  if (stringFiller.length > fillLen) stringFiller = stringFiller.slice(0, fillLen);
  return left ? stringFiller + S : S + stringFiller;
};

},{"./_defined":254,"./_string-repeat":333,"./_to-length":341}],333:[function(require,module,exports){
'use strict';

var toInteger = require('./_to-integer');
var defined = require('./_defined');

module.exports = function repeat(count) {
  var str = String(defined(this));
  var res = '';
  var n = toInteger(count);
  if (n < 0 || n == Infinity) throw RangeError("Count can't be negative");
  for (; n > 0; (n >>>= 1) && (str += str)) {
    if (n & 1) res += str;
  }return res;
};

},{"./_defined":254,"./_to-integer":339}],334:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var defined = require('./_defined');
var fails = require('./_fails');
var spaces = require('./_string-ws');
var space = '[' + spaces + ']';
var non = '\u200B\x85';
var ltrim = RegExp('^' + space + space + '*');
var rtrim = RegExp(space + space + '*$');

var exporter = function exporter(KEY, exec, ALIAS) {
  var exp = {};
  var FORCE = fails(function () {
    return !!spaces[KEY]() || non[KEY]() != non;
  });
  var fn = exp[KEY] = FORCE ? exec(trim) : spaces[KEY];
  if (ALIAS) exp[ALIAS] = fn;
  $export($export.P + $export.F * FORCE, 'String', exp);
};

// 1 -> String#trimLeft
// 2 -> String#trimRight
// 3 -> String#trim
var trim = exporter.trim = function (string, TYPE) {
  string = String(defined(string));
  if (TYPE & 1) string = string.replace(ltrim, '');
  if (TYPE & 2) string = string.replace(rtrim, '');
  return string;
};

module.exports = exporter;

},{"./_defined":254,"./_export":259,"./_fails":261,"./_string-ws":335}],335:[function(require,module,exports){
'use strict';

module.exports = '\t\n\x0B\f\r \xA0\u1680\u180E\u2000\u2001\u2002\u2003' + '\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028\u2029\uFEFF';

},{}],336:[function(require,module,exports){
arguments[4][198][0].apply(exports,arguments)
},{"./_cof":244,"./_ctx":251,"./_dom-create":256,"./_global":266,"./_html":269,"./_invoke":272,"dup":198}],337:[function(require,module,exports){
arguments[4][199][0].apply(exports,arguments)
},{"./_to-integer":339,"dup":199}],338:[function(require,module,exports){
'use strict';

// https://tc39.github.io/ecma262/#sec-toindex
var toInteger = require('./_to-integer');
var toLength = require('./_to-length');
module.exports = function (it) {
  if (it === undefined) return 0;
  var number = toInteger(it);
  var length = toLength(number);
  if (number !== length) throw RangeError('Wrong length!');
  return length;
};

},{"./_to-integer":339,"./_to-length":341}],339:[function(require,module,exports){
arguments[4][200][0].apply(exports,arguments)
},{"dup":200}],340:[function(require,module,exports){
arguments[4][201][0].apply(exports,arguments)
},{"./_defined":254,"./_iobject":273,"dup":201}],341:[function(require,module,exports){
arguments[4][202][0].apply(exports,arguments)
},{"./_to-integer":339,"dup":202}],342:[function(require,module,exports){
arguments[4][203][0].apply(exports,arguments)
},{"./_defined":254,"dup":203}],343:[function(require,module,exports){
arguments[4][204][0].apply(exports,arguments)
},{"./_is-object":277,"dup":204}],344:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

if (require('./_descriptors')) {
  var LIBRARY = require('./_library');
  var global = require('./_global');
  var fails = require('./_fails');
  var $export = require('./_export');
  var $typed = require('./_typed');
  var $buffer = require('./_typed-buffer');
  var ctx = require('./_ctx');
  var anInstance = require('./_an-instance');
  var propertyDesc = require('./_property-desc');
  var hide = require('./_hide');
  var redefineAll = require('./_redefine-all');
  var toInteger = require('./_to-integer');
  var toLength = require('./_to-length');
  var toIndex = require('./_to-index');
  var toAbsoluteIndex = require('./_to-absolute-index');
  var toPrimitive = require('./_to-primitive');
  var has = require('./_has');
  var classof = require('./_classof');
  var isObject = require('./_is-object');
  var toObject = require('./_to-object');
  var isArrayIter = require('./_is-array-iter');
  var create = require('./_object-create');
  var getPrototypeOf = require('./_object-gpo');
  var gOPN = require('./_object-gopn').f;
  var getIterFn = require('./core.get-iterator-method');
  var uid = require('./_uid');
  var wks = require('./_wks');
  var createArrayMethod = require('./_array-methods');
  var createArrayIncludes = require('./_array-includes');
  var speciesConstructor = require('./_species-constructor');
  var ArrayIterators = require('./es6.array.iterator');
  var Iterators = require('./_iterators');
  var $iterDetect = require('./_iter-detect');
  var setSpecies = require('./_set-species');
  var arrayFill = require('./_array-fill');
  var arrayCopyWithin = require('./_array-copy-within');
  var $DP = require('./_object-dp');
  var $GOPD = require('./_object-gopd');
  var dP = $DP.f;
  var gOPD = $GOPD.f;
  var RangeError = global.RangeError;
  var TypeError = global.TypeError;
  var Uint8Array = global.Uint8Array;
  var ARRAY_BUFFER = 'ArrayBuffer';
  var SHARED_BUFFER = 'Shared' + ARRAY_BUFFER;
  var BYTES_PER_ELEMENT = 'BYTES_PER_ELEMENT';
  var PROTOTYPE = 'prototype';
  var ArrayProto = Array[PROTOTYPE];
  var $ArrayBuffer = $buffer.ArrayBuffer;
  var $DataView = $buffer.DataView;
  var arrayForEach = createArrayMethod(0);
  var arrayFilter = createArrayMethod(2);
  var arraySome = createArrayMethod(3);
  var arrayEvery = createArrayMethod(4);
  var arrayFind = createArrayMethod(5);
  var arrayFindIndex = createArrayMethod(6);
  var arrayIncludes = createArrayIncludes(true);
  var arrayIndexOf = createArrayIncludes(false);
  var arrayValues = ArrayIterators.values;
  var arrayKeys = ArrayIterators.keys;
  var arrayEntries = ArrayIterators.entries;
  var arrayLastIndexOf = ArrayProto.lastIndexOf;
  var arrayReduce = ArrayProto.reduce;
  var arrayReduceRight = ArrayProto.reduceRight;
  var arrayJoin = ArrayProto.join;
  var arraySort = ArrayProto.sort;
  var arraySlice = ArrayProto.slice;
  var arrayToString = ArrayProto.toString;
  var arrayToLocaleString = ArrayProto.toLocaleString;
  var ITERATOR = wks('iterator');
  var TAG = wks('toStringTag');
  var TYPED_CONSTRUCTOR = uid('typed_constructor');
  var DEF_CONSTRUCTOR = uid('def_constructor');
  var ALL_CONSTRUCTORS = $typed.CONSTR;
  var TYPED_ARRAY = $typed.TYPED;
  var VIEW = $typed.VIEW;
  var WRONG_LENGTH = 'Wrong length!';

  var $map = createArrayMethod(1, function (O, length) {
    return allocate(speciesConstructor(O, O[DEF_CONSTRUCTOR]), length);
  });

  var LITTLE_ENDIAN = fails(function () {
    // eslint-disable-next-line no-undef
    return new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  });

  var FORCED_SET = !!Uint8Array && !!Uint8Array[PROTOTYPE].set && fails(function () {
    new Uint8Array(1).set({});
  });

  var toOffset = function toOffset(it, BYTES) {
    var offset = toInteger(it);
    if (offset < 0 || offset % BYTES) throw RangeError('Wrong offset!');
    return offset;
  };

  var validate = function validate(it) {
    if (isObject(it) && TYPED_ARRAY in it) return it;
    throw TypeError(it + ' is not a typed array!');
  };

  var allocate = function allocate(C, length) {
    if (!(isObject(C) && TYPED_CONSTRUCTOR in C)) {
      throw TypeError('It is not a typed array constructor!');
    }return new C(length);
  };

  var speciesFromList = function speciesFromList(O, list) {
    return fromList(speciesConstructor(O, O[DEF_CONSTRUCTOR]), list);
  };

  var fromList = function fromList(C, list) {
    var index = 0;
    var length = list.length;
    var result = allocate(C, length);
    while (length > index) {
      result[index] = list[index++];
    }return result;
  };

  var addGetter = function addGetter(it, key, internal) {
    dP(it, key, { get: function get() {
        return this._d[internal];
      } });
  };

  var $from = function from(source /* , mapfn, thisArg */) {
    var O = toObject(source);
    var aLen = arguments.length;
    var mapfn = aLen > 1 ? arguments[1] : undefined;
    var mapping = mapfn !== undefined;
    var iterFn = getIterFn(O);
    var i, length, values, result, step, iterator;
    if (iterFn != undefined && !isArrayIter(iterFn)) {
      for (iterator = iterFn.call(O), values = [], i = 0; !(step = iterator.next()).done; i++) {
        values.push(step.value);
      }O = values;
    }
    if (mapping && aLen > 2) mapfn = ctx(mapfn, arguments[2], 2);
    for (i = 0, length = toLength(O.length), result = allocate(this, length); length > i; i++) {
      result[i] = mapping ? mapfn(O[i], i) : O[i];
    }
    return result;
  };

  var $of = function of() /* ...items */{
    var index = 0;
    var length = arguments.length;
    var result = allocate(this, length);
    while (length > index) {
      result[index] = arguments[index++];
    }return result;
  };

  // iOS Safari 6.x fails here
  var TO_LOCALE_BUG = !!Uint8Array && fails(function () {
    arrayToLocaleString.call(new Uint8Array(1));
  });

  var $toLocaleString = function toLocaleString() {
    return arrayToLocaleString.apply(TO_LOCALE_BUG ? arraySlice.call(validate(this)) : validate(this), arguments);
  };

  var proto = {
    copyWithin: function copyWithin(target, start /* , end */) {
      return arrayCopyWithin.call(validate(this), target, start, arguments.length > 2 ? arguments[2] : undefined);
    },
    every: function every(callbackfn /* , thisArg */) {
      return arrayEvery(validate(this), callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    },
    fill: function fill(value /* , start, end */) {
      // eslint-disable-line no-unused-vars
      return arrayFill.apply(validate(this), arguments);
    },
    filter: function filter(callbackfn /* , thisArg */) {
      return speciesFromList(this, arrayFilter(validate(this), callbackfn, arguments.length > 1 ? arguments[1] : undefined));
    },
    find: function find(predicate /* , thisArg */) {
      return arrayFind(validate(this), predicate, arguments.length > 1 ? arguments[1] : undefined);
    },
    findIndex: function findIndex(predicate /* , thisArg */) {
      return arrayFindIndex(validate(this), predicate, arguments.length > 1 ? arguments[1] : undefined);
    },
    forEach: function forEach(callbackfn /* , thisArg */) {
      arrayForEach(validate(this), callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    },
    indexOf: function indexOf(searchElement /* , fromIndex */) {
      return arrayIndexOf(validate(this), searchElement, arguments.length > 1 ? arguments[1] : undefined);
    },
    includes: function includes(searchElement /* , fromIndex */) {
      return arrayIncludes(validate(this), searchElement, arguments.length > 1 ? arguments[1] : undefined);
    },
    join: function join(separator) {
      // eslint-disable-line no-unused-vars
      return arrayJoin.apply(validate(this), arguments);
    },
    lastIndexOf: function lastIndexOf(searchElement /* , fromIndex */) {
      // eslint-disable-line no-unused-vars
      return arrayLastIndexOf.apply(validate(this), arguments);
    },
    map: function map(mapfn /* , thisArg */) {
      return $map(validate(this), mapfn, arguments.length > 1 ? arguments[1] : undefined);
    },
    reduce: function reduce(callbackfn /* , initialValue */) {
      // eslint-disable-line no-unused-vars
      return arrayReduce.apply(validate(this), arguments);
    },
    reduceRight: function reduceRight(callbackfn /* , initialValue */) {
      // eslint-disable-line no-unused-vars
      return arrayReduceRight.apply(validate(this), arguments);
    },
    reverse: function reverse() {
      var that = this;
      var length = validate(that).length;
      var middle = Math.floor(length / 2);
      var index = 0;
      var value;
      while (index < middle) {
        value = that[index];
        that[index++] = that[--length];
        that[length] = value;
      }return that;
    },
    some: function some(callbackfn /* , thisArg */) {
      return arraySome(validate(this), callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    },
    sort: function sort(comparefn) {
      return arraySort.call(validate(this), comparefn);
    },
    subarray: function subarray(begin, end) {
      var O = validate(this);
      var length = O.length;
      var $begin = toAbsoluteIndex(begin, length);
      return new (speciesConstructor(O, O[DEF_CONSTRUCTOR]))(O.buffer, O.byteOffset + $begin * O.BYTES_PER_ELEMENT, toLength((end === undefined ? length : toAbsoluteIndex(end, length)) - $begin));
    }
  };

  var $slice = function slice(start, end) {
    return speciesFromList(this, arraySlice.call(validate(this), start, end));
  };

  var $set = function set(arrayLike /* , offset */) {
    validate(this);
    var offset = toOffset(arguments[1], 1);
    var length = this.length;
    var src = toObject(arrayLike);
    var len = toLength(src.length);
    var index = 0;
    if (len + offset > length) throw RangeError(WRONG_LENGTH);
    while (index < len) {
      this[offset + index] = src[index++];
    }
  };

  var $iterators = {
    entries: function entries() {
      return arrayEntries.call(validate(this));
    },
    keys: function keys() {
      return arrayKeys.call(validate(this));
    },
    values: function values() {
      return arrayValues.call(validate(this));
    }
  };

  var isTAIndex = function isTAIndex(target, key) {
    return isObject(target) && target[TYPED_ARRAY] && (typeof key === 'undefined' ? 'undefined' : _typeof(key)) != 'symbol' && key in target && String(+key) == String(key);
  };
  var $getDesc = function getOwnPropertyDescriptor(target, key) {
    return isTAIndex(target, key = toPrimitive(key, true)) ? propertyDesc(2, target[key]) : gOPD(target, key);
  };
  var $setDesc = function defineProperty(target, key, desc) {
    if (isTAIndex(target, key = toPrimitive(key, true)) && isObject(desc) && has(desc, 'value') && !has(desc, 'get') && !has(desc, 'set')
    // TODO: add validation descriptor w/o calling accessors
    && !desc.configurable && (!has(desc, 'writable') || desc.writable) && (!has(desc, 'enumerable') || desc.enumerable)) {
      target[key] = desc.value;
      return target;
    }return dP(target, key, desc);
  };

  if (!ALL_CONSTRUCTORS) {
    $GOPD.f = $getDesc;
    $DP.f = $setDesc;
  }

  $export($export.S + $export.F * !ALL_CONSTRUCTORS, 'Object', {
    getOwnPropertyDescriptor: $getDesc,
    defineProperty: $setDesc
  });

  if (fails(function () {
    arrayToString.call({});
  })) {
    arrayToString = arrayToLocaleString = function toString() {
      return arrayJoin.call(this);
    };
  }

  var $TypedArrayPrototype$ = redefineAll({}, proto);
  redefineAll($TypedArrayPrototype$, $iterators);
  hide($TypedArrayPrototype$, ITERATOR, $iterators.values);
  redefineAll($TypedArrayPrototype$, {
    slice: $slice,
    set: $set,
    constructor: function constructor() {/* noop */},
    toString: arrayToString,
    toLocaleString: $toLocaleString
  });
  addGetter($TypedArrayPrototype$, 'buffer', 'b');
  addGetter($TypedArrayPrototype$, 'byteOffset', 'o');
  addGetter($TypedArrayPrototype$, 'byteLength', 'l');
  addGetter($TypedArrayPrototype$, 'length', 'e');
  dP($TypedArrayPrototype$, TAG, {
    get: function get() {
      return this[TYPED_ARRAY];
    }
  });

  // eslint-disable-next-line max-statements
  module.exports = function (KEY, BYTES, wrapper, CLAMPED) {
    CLAMPED = !!CLAMPED;
    var NAME = KEY + (CLAMPED ? 'Clamped' : '') + 'Array';
    var GETTER = 'get' + KEY;
    var SETTER = 'set' + KEY;
    var TypedArray = global[NAME];
    var Base = TypedArray || {};
    var TAC = TypedArray && getPrototypeOf(TypedArray);
    var FORCED = !TypedArray || !$typed.ABV;
    var O = {};
    var TypedArrayPrototype = TypedArray && TypedArray[PROTOTYPE];
    var getter = function getter(that, index) {
      var data = that._d;
      return data.v[GETTER](index * BYTES + data.o, LITTLE_ENDIAN);
    };
    var setter = function setter(that, index, value) {
      var data = that._d;
      if (CLAMPED) value = (value = Math.round(value)) < 0 ? 0 : value > 0xff ? 0xff : value & 0xff;
      data.v[SETTER](index * BYTES + data.o, value, LITTLE_ENDIAN);
    };
    var addElement = function addElement(that, index) {
      dP(that, index, {
        get: function get() {
          return getter(this, index);
        },
        set: function set(value) {
          return setter(this, index, value);
        },
        enumerable: true
      });
    };
    if (FORCED) {
      TypedArray = wrapper(function (that, data, $offset, $length) {
        anInstance(that, TypedArray, NAME, '_d');
        var index = 0;
        var offset = 0;
        var buffer, byteLength, length, klass;
        if (!isObject(data)) {
          length = toIndex(data);
          byteLength = length * BYTES;
          buffer = new $ArrayBuffer(byteLength);
        } else if (data instanceof $ArrayBuffer || (klass = classof(data)) == ARRAY_BUFFER || klass == SHARED_BUFFER) {
          buffer = data;
          offset = toOffset($offset, BYTES);
          var $len = data.byteLength;
          if ($length === undefined) {
            if ($len % BYTES) throw RangeError(WRONG_LENGTH);
            byteLength = $len - offset;
            if (byteLength < 0) throw RangeError(WRONG_LENGTH);
          } else {
            byteLength = toLength($length) * BYTES;
            if (byteLength + offset > $len) throw RangeError(WRONG_LENGTH);
          }
          length = byteLength / BYTES;
        } else if (TYPED_ARRAY in data) {
          return fromList(TypedArray, data);
        } else {
          return $from.call(TypedArray, data);
        }
        hide(that, '_d', {
          b: buffer,
          o: offset,
          l: byteLength,
          e: length,
          v: new $DataView(buffer)
        });
        while (index < length) {
          addElement(that, index++);
        }
      });
      TypedArrayPrototype = TypedArray[PROTOTYPE] = create($TypedArrayPrototype$);
      hide(TypedArrayPrototype, 'constructor', TypedArray);
    } else if (!fails(function () {
      TypedArray(1);
    }) || !fails(function () {
      new TypedArray(-1); // eslint-disable-line no-new
    }) || !$iterDetect(function (iter) {
      new TypedArray(); // eslint-disable-line no-new
      new TypedArray(null); // eslint-disable-line no-new
      new TypedArray(1.5); // eslint-disable-line no-new
      new TypedArray(iter); // eslint-disable-line no-new
    }, true)) {
      TypedArray = wrapper(function (that, data, $offset, $length) {
        anInstance(that, TypedArray, NAME);
        var klass;
        // `ws` module bug, temporarily remove validation length for Uint8Array
        // https://github.com/websockets/ws/pull/645
        if (!isObject(data)) return new Base(toIndex(data));
        if (data instanceof $ArrayBuffer || (klass = classof(data)) == ARRAY_BUFFER || klass == SHARED_BUFFER) {
          return $length !== undefined ? new Base(data, toOffset($offset, BYTES), $length) : $offset !== undefined ? new Base(data, toOffset($offset, BYTES)) : new Base(data);
        }
        if (TYPED_ARRAY in data) return fromList(TypedArray, data);
        return $from.call(TypedArray, data);
      });
      arrayForEach(TAC !== Function.prototype ? gOPN(Base).concat(gOPN(TAC)) : gOPN(Base), function (key) {
        if (!(key in TypedArray)) hide(TypedArray, key, Base[key]);
      });
      TypedArray[PROTOTYPE] = TypedArrayPrototype;
      if (!LIBRARY) TypedArrayPrototype.constructor = TypedArray;
    }
    var $nativeIterator = TypedArrayPrototype[ITERATOR];
    var CORRECT_ITER_NAME = !!$nativeIterator && ($nativeIterator.name == 'values' || $nativeIterator.name == undefined);
    var $iterator = $iterators.values;
    hide(TypedArray, TYPED_CONSTRUCTOR, true);
    hide(TypedArrayPrototype, TYPED_ARRAY, NAME);
    hide(TypedArrayPrototype, VIEW, true);
    hide(TypedArrayPrototype, DEF_CONSTRUCTOR, TypedArray);

    if (CLAMPED ? new TypedArray(1)[TAG] != NAME : !(TAG in TypedArrayPrototype)) {
      dP(TypedArrayPrototype, TAG, {
        get: function get() {
          return NAME;
        }
      });
    }

    O[NAME] = TypedArray;

    $export($export.G + $export.W + $export.F * (TypedArray != Base), O);

    $export($export.S, NAME, {
      BYTES_PER_ELEMENT: BYTES
    });

    $export($export.S + $export.F * fails(function () {
      Base.of.call(TypedArray, 1);
    }), NAME, {
      from: $from,
      of: $of
    });

    if (!(BYTES_PER_ELEMENT in TypedArrayPrototype)) hide(TypedArrayPrototype, BYTES_PER_ELEMENT, BYTES);

    $export($export.P, NAME, proto);

    setSpecies(NAME);

    $export($export.P + $export.F * FORCED_SET, NAME, { set: $set });

    $export($export.P + $export.F * !CORRECT_ITER_NAME, NAME, $iterators);

    if (!LIBRARY && TypedArrayPrototype.toString != arrayToString) TypedArrayPrototype.toString = arrayToString;

    $export($export.P + $export.F * fails(function () {
      new TypedArray(1).slice();
    }), NAME, { slice: $slice });

    $export($export.P + $export.F * (fails(function () {
      return [1, 2].toLocaleString() != new TypedArray([1, 2]).toLocaleString();
    }) || !fails(function () {
      TypedArrayPrototype.toLocaleString.call([1, 2]);
    })), NAME, { toLocaleString: $toLocaleString });

    Iterators[NAME] = CORRECT_ITER_NAME ? $nativeIterator : $iterator;
    if (!LIBRARY && !CORRECT_ITER_NAME) hide(TypedArrayPrototype, ITERATOR, $iterator);
  };
} else module.exports = function () {/* empty */};

},{"./_an-instance":232,"./_array-copy-within":234,"./_array-fill":235,"./_array-includes":237,"./_array-methods":238,"./_classof":243,"./_ctx":251,"./_descriptors":255,"./_export":259,"./_fails":261,"./_global":266,"./_has":267,"./_hide":268,"./_is-array-iter":274,"./_is-object":277,"./_iter-detect":282,"./_iterators":284,"./_library":285,"./_object-create":296,"./_object-dp":297,"./_object-gopd":300,"./_object-gopn":302,"./_object-gpo":304,"./_property-desc":315,"./_redefine-all":316,"./_set-species":323,"./_species-constructor":327,"./_to-absolute-index":337,"./_to-index":338,"./_to-integer":339,"./_to-length":341,"./_to-object":342,"./_to-primitive":343,"./_typed":346,"./_typed-buffer":345,"./_uid":347,"./_wks":352,"./core.get-iterator-method":353,"./es6.array.iterator":365}],345:[function(require,module,exports){
'use strict';

var global = require('./_global');
var DESCRIPTORS = require('./_descriptors');
var LIBRARY = require('./_library');
var $typed = require('./_typed');
var hide = require('./_hide');
var redefineAll = require('./_redefine-all');
var fails = require('./_fails');
var anInstance = require('./_an-instance');
var toInteger = require('./_to-integer');
var toLength = require('./_to-length');
var toIndex = require('./_to-index');
var gOPN = require('./_object-gopn').f;
var dP = require('./_object-dp').f;
var arrayFill = require('./_array-fill');
var setToStringTag = require('./_set-to-string-tag');
var ARRAY_BUFFER = 'ArrayBuffer';
var DATA_VIEW = 'DataView';
var PROTOTYPE = 'prototype';
var WRONG_LENGTH = 'Wrong length!';
var WRONG_INDEX = 'Wrong index!';
var $ArrayBuffer = global[ARRAY_BUFFER];
var $DataView = global[DATA_VIEW];
var Math = global.Math;
var RangeError = global.RangeError;
// eslint-disable-next-line no-shadow-restricted-names
var Infinity = global.Infinity;
var BaseBuffer = $ArrayBuffer;
var abs = Math.abs;
var pow = Math.pow;
var floor = Math.floor;
var log = Math.log;
var LN2 = Math.LN2;
var BUFFER = 'buffer';
var BYTE_LENGTH = 'byteLength';
var BYTE_OFFSET = 'byteOffset';
var $BUFFER = DESCRIPTORS ? '_b' : BUFFER;
var $LENGTH = DESCRIPTORS ? '_l' : BYTE_LENGTH;
var $OFFSET = DESCRIPTORS ? '_o' : BYTE_OFFSET;

// IEEE754 conversions based on https://github.com/feross/ieee754
function packIEEE754(value, mLen, nBytes) {
  var buffer = new Array(nBytes);
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = mLen === 23 ? pow(2, -24) - pow(2, -77) : 0;
  var i = 0;
  var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
  var e, m, c;
  value = abs(value);
  // eslint-disable-next-line no-self-compare
  if (value != value || value === Infinity) {
    // eslint-disable-next-line no-self-compare
    m = value != value ? 1 : 0;
    e = eMax;
  } else {
    e = floor(log(value) / LN2);
    if (value * (c = pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }
    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * pow(2, eBias - 1) * pow(2, mLen);
      e = 0;
    }
  }
  for (; mLen >= 8; buffer[i++] = m & 255, m /= 256, mLen -= 8) {}
  e = e << mLen | m;
  eLen += mLen;
  for (; eLen > 0; buffer[i++] = e & 255, e /= 256, eLen -= 8) {}
  buffer[--i] |= s * 128;
  return buffer;
}
function unpackIEEE754(buffer, mLen, nBytes) {
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = eLen - 7;
  var i = nBytes - 1;
  var s = buffer[i--];
  var e = s & 127;
  var m;
  s >>= 7;
  for (; nBits > 0; e = e * 256 + buffer[i], i--, nBits -= 8) {}
  m = e & (1 << -nBits) - 1;
  e >>= -nBits;
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[i], i--, nBits -= 8) {}
  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : s ? -Infinity : Infinity;
  } else {
    m = m + pow(2, mLen);
    e = e - eBias;
  }return (s ? -1 : 1) * m * pow(2, e - mLen);
}

function unpackI32(bytes) {
  return bytes[3] << 24 | bytes[2] << 16 | bytes[1] << 8 | bytes[0];
}
function packI8(it) {
  return [it & 0xff];
}
function packI16(it) {
  return [it & 0xff, it >> 8 & 0xff];
}
function packI32(it) {
  return [it & 0xff, it >> 8 & 0xff, it >> 16 & 0xff, it >> 24 & 0xff];
}
function packF64(it) {
  return packIEEE754(it, 52, 8);
}
function packF32(it) {
  return packIEEE754(it, 23, 4);
}

function addGetter(C, key, internal) {
  dP(C[PROTOTYPE], key, { get: function get() {
      return this[internal];
    } });
}

function get(view, bytes, index, isLittleEndian) {
  var numIndex = +index;
  var intIndex = toIndex(numIndex);
  if (intIndex + bytes > view[$LENGTH]) throw RangeError(WRONG_INDEX);
  var store = view[$BUFFER]._b;
  var start = intIndex + view[$OFFSET];
  var pack = store.slice(start, start + bytes);
  return isLittleEndian ? pack : pack.reverse();
}
function set(view, bytes, index, conversion, value, isLittleEndian) {
  var numIndex = +index;
  var intIndex = toIndex(numIndex);
  if (intIndex + bytes > view[$LENGTH]) throw RangeError(WRONG_INDEX);
  var store = view[$BUFFER]._b;
  var start = intIndex + view[$OFFSET];
  var pack = conversion(+value);
  for (var i = 0; i < bytes; i++) {
    store[start + i] = pack[isLittleEndian ? i : bytes - i - 1];
  }
}

if (!$typed.ABV) {
  $ArrayBuffer = function ArrayBuffer(length) {
    anInstance(this, $ArrayBuffer, ARRAY_BUFFER);
    var byteLength = toIndex(length);
    this._b = arrayFill.call(new Array(byteLength), 0);
    this[$LENGTH] = byteLength;
  };

  $DataView = function DataView(buffer, byteOffset, byteLength) {
    anInstance(this, $DataView, DATA_VIEW);
    anInstance(buffer, $ArrayBuffer, DATA_VIEW);
    var bufferLength = buffer[$LENGTH];
    var offset = toInteger(byteOffset);
    if (offset < 0 || offset > bufferLength) throw RangeError('Wrong offset!');
    byteLength = byteLength === undefined ? bufferLength - offset : toLength(byteLength);
    if (offset + byteLength > bufferLength) throw RangeError(WRONG_LENGTH);
    this[$BUFFER] = buffer;
    this[$OFFSET] = offset;
    this[$LENGTH] = byteLength;
  };

  if (DESCRIPTORS) {
    addGetter($ArrayBuffer, BYTE_LENGTH, '_l');
    addGetter($DataView, BUFFER, '_b');
    addGetter($DataView, BYTE_LENGTH, '_l');
    addGetter($DataView, BYTE_OFFSET, '_o');
  }

  redefineAll($DataView[PROTOTYPE], {
    getInt8: function getInt8(byteOffset) {
      return get(this, 1, byteOffset)[0] << 24 >> 24;
    },
    getUint8: function getUint8(byteOffset) {
      return get(this, 1, byteOffset)[0];
    },
    getInt16: function getInt16(byteOffset /* , littleEndian */) {
      var bytes = get(this, 2, byteOffset, arguments[1]);
      return (bytes[1] << 8 | bytes[0]) << 16 >> 16;
    },
    getUint16: function getUint16(byteOffset /* , littleEndian */) {
      var bytes = get(this, 2, byteOffset, arguments[1]);
      return bytes[1] << 8 | bytes[0];
    },
    getInt32: function getInt32(byteOffset /* , littleEndian */) {
      return unpackI32(get(this, 4, byteOffset, arguments[1]));
    },
    getUint32: function getUint32(byteOffset /* , littleEndian */) {
      return unpackI32(get(this, 4, byteOffset, arguments[1])) >>> 0;
    },
    getFloat32: function getFloat32(byteOffset /* , littleEndian */) {
      return unpackIEEE754(get(this, 4, byteOffset, arguments[1]), 23, 4);
    },
    getFloat64: function getFloat64(byteOffset /* , littleEndian */) {
      return unpackIEEE754(get(this, 8, byteOffset, arguments[1]), 52, 8);
    },
    setInt8: function setInt8(byteOffset, value) {
      set(this, 1, byteOffset, packI8, value);
    },
    setUint8: function setUint8(byteOffset, value) {
      set(this, 1, byteOffset, packI8, value);
    },
    setInt16: function setInt16(byteOffset, value /* , littleEndian */) {
      set(this, 2, byteOffset, packI16, value, arguments[2]);
    },
    setUint16: function setUint16(byteOffset, value /* , littleEndian */) {
      set(this, 2, byteOffset, packI16, value, arguments[2]);
    },
    setInt32: function setInt32(byteOffset, value /* , littleEndian */) {
      set(this, 4, byteOffset, packI32, value, arguments[2]);
    },
    setUint32: function setUint32(byteOffset, value /* , littleEndian */) {
      set(this, 4, byteOffset, packI32, value, arguments[2]);
    },
    setFloat32: function setFloat32(byteOffset, value /* , littleEndian */) {
      set(this, 4, byteOffset, packF32, value, arguments[2]);
    },
    setFloat64: function setFloat64(byteOffset, value /* , littleEndian */) {
      set(this, 8, byteOffset, packF64, value, arguments[2]);
    }
  });
} else {
  if (!fails(function () {
    $ArrayBuffer(1);
  }) || !fails(function () {
    new $ArrayBuffer(-1); // eslint-disable-line no-new
  }) || fails(function () {
    new $ArrayBuffer(); // eslint-disable-line no-new
    new $ArrayBuffer(1.5); // eslint-disable-line no-new
    new $ArrayBuffer(NaN); // eslint-disable-line no-new
    return $ArrayBuffer.name != ARRAY_BUFFER;
  })) {
    $ArrayBuffer = function ArrayBuffer(length) {
      anInstance(this, $ArrayBuffer);
      return new BaseBuffer(toIndex(length));
    };
    var ArrayBufferProto = $ArrayBuffer[PROTOTYPE] = BaseBuffer[PROTOTYPE];
    for (var keys = gOPN(BaseBuffer), j = 0, key; keys.length > j;) {
      if (!((key = keys[j++]) in $ArrayBuffer)) hide($ArrayBuffer, key, BaseBuffer[key]);
    }
    if (!LIBRARY) ArrayBufferProto.constructor = $ArrayBuffer;
  }
  // iOS Safari 7.x bug
  var view = new $DataView(new $ArrayBuffer(2));
  var $setInt8 = $DataView[PROTOTYPE].setInt8;
  view.setInt8(0, 2147483648);
  view.setInt8(1, 2147483649);
  if (view.getInt8(0) || !view.getInt8(1)) redefineAll($DataView[PROTOTYPE], {
    setInt8: function setInt8(byteOffset, value) {
      $setInt8.call(this, byteOffset, value << 24 >> 24);
    },
    setUint8: function setUint8(byteOffset, value) {
      $setInt8.call(this, byteOffset, value << 24 >> 24);
    }
  }, true);
}
setToStringTag($ArrayBuffer, ARRAY_BUFFER);
setToStringTag($DataView, DATA_VIEW);
hide($DataView[PROTOTYPE], $typed.VIEW, true);
exports[ARRAY_BUFFER] = $ArrayBuffer;
exports[DATA_VIEW] = $DataView;

},{"./_an-instance":232,"./_array-fill":235,"./_descriptors":255,"./_fails":261,"./_global":266,"./_hide":268,"./_library":285,"./_object-dp":297,"./_object-gopn":302,"./_redefine-all":316,"./_set-to-string-tag":324,"./_to-index":338,"./_to-integer":339,"./_to-length":341,"./_typed":346}],346:[function(require,module,exports){
'use strict';

var global = require('./_global');
var hide = require('./_hide');
var uid = require('./_uid');
var TYPED = uid('typed_array');
var VIEW = uid('view');
var ABV = !!(global.ArrayBuffer && global.DataView);
var CONSTR = ABV;
var i = 0;
var l = 9;
var Typed;

var TypedArrayConstructors = 'Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array'.split(',');

while (i < l) {
  if (Typed = global[TypedArrayConstructors[i++]]) {
    hide(Typed.prototype, TYPED, true);
    hide(Typed.prototype, VIEW, true);
  } else CONSTR = false;
}

module.exports = {
  ABV: ABV,
  CONSTR: CONSTR,
  TYPED: TYPED,
  VIEW: VIEW
};

},{"./_global":266,"./_hide":268,"./_uid":347}],347:[function(require,module,exports){
arguments[4][205][0].apply(exports,arguments)
},{"dup":205}],348:[function(require,module,exports){
arguments[4][206][0].apply(exports,arguments)
},{"./_global":266,"dup":206}],349:[function(require,module,exports){
'use strict';

var isObject = require('./_is-object');
module.exports = function (it, TYPE) {
  if (!isObject(it) || it._t !== TYPE) throw TypeError('Incompatible receiver, ' + TYPE + ' required!');
  return it;
};

},{"./_is-object":277}],350:[function(require,module,exports){
arguments[4][207][0].apply(exports,arguments)
},{"./_core":249,"./_global":266,"./_library":285,"./_object-dp":297,"./_wks-ext":351,"dup":207}],351:[function(require,module,exports){
arguments[4][208][0].apply(exports,arguments)
},{"./_wks":352,"dup":208}],352:[function(require,module,exports){
arguments[4][209][0].apply(exports,arguments)
},{"./_global":266,"./_shared":326,"./_uid":347,"dup":209}],353:[function(require,module,exports){
arguments[4][210][0].apply(exports,arguments)
},{"./_classof":243,"./_core":249,"./_iterators":284,"./_wks":352,"dup":210}],354:[function(require,module,exports){
'use strict';

// https://github.com/benjamingr/RexExp.escape
var $export = require('./_export');
var $re = require('./_replacer')(/[\\^$*+?.()|[\]{}]/g, '\\$&');

$export($export.S, 'RegExp', { escape: function escape(it) {
    return $re(it);
  } });

},{"./_export":259,"./_replacer":318}],355:[function(require,module,exports){
'use strict';

// 22.1.3.3 Array.prototype.copyWithin(target, start, end = this.length)
var $export = require('./_export');

$export($export.P, 'Array', { copyWithin: require('./_array-copy-within') });

require('./_add-to-unscopables')('copyWithin');

},{"./_add-to-unscopables":231,"./_array-copy-within":234,"./_export":259}],356:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $every = require('./_array-methods')(4);

$export($export.P + $export.F * !require('./_strict-method')([].every, true), 'Array', {
  // 22.1.3.5 / 15.4.4.16 Array.prototype.every(callbackfn [, thisArg])
  every: function every(callbackfn /* , thisArg */) {
    return $every(this, callbackfn, arguments[1]);
  }
});

},{"./_array-methods":238,"./_export":259,"./_strict-method":328}],357:[function(require,module,exports){
'use strict';

// 22.1.3.6 Array.prototype.fill(value, start = 0, end = this.length)
var $export = require('./_export');

$export($export.P, 'Array', { fill: require('./_array-fill') });

require('./_add-to-unscopables')('fill');

},{"./_add-to-unscopables":231,"./_array-fill":235,"./_export":259}],358:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $filter = require('./_array-methods')(2);

$export($export.P + $export.F * !require('./_strict-method')([].filter, true), 'Array', {
  // 22.1.3.7 / 15.4.4.20 Array.prototype.filter(callbackfn [, thisArg])
  filter: function filter(callbackfn /* , thisArg */) {
    return $filter(this, callbackfn, arguments[1]);
  }
});

},{"./_array-methods":238,"./_export":259,"./_strict-method":328}],359:[function(require,module,exports){
'use strict';
// 22.1.3.9 Array.prototype.findIndex(predicate, thisArg = undefined)

var $export = require('./_export');
var $find = require('./_array-methods')(6);
var KEY = 'findIndex';
var forced = true;
// Shouldn't skip holes
if (KEY in []) Array(1)[KEY](function () {
  forced = false;
});
$export($export.P + $export.F * forced, 'Array', {
  findIndex: function findIndex(callbackfn /* , that = undefined */) {
    return $find(this, callbackfn, arguments.length > 1 ? arguments[1] : undefined);
  }
});
require('./_add-to-unscopables')(KEY);

},{"./_add-to-unscopables":231,"./_array-methods":238,"./_export":259}],360:[function(require,module,exports){
'use strict';
// 22.1.3.8 Array.prototype.find(predicate, thisArg = undefined)

var $export = require('./_export');
var $find = require('./_array-methods')(5);
var KEY = 'find';
var forced = true;
// Shouldn't skip holes
if (KEY in []) Array(1)[KEY](function () {
  forced = false;
});
$export($export.P + $export.F * forced, 'Array', {
  find: function find(callbackfn /* , that = undefined */) {
    return $find(this, callbackfn, arguments.length > 1 ? arguments[1] : undefined);
  }
});
require('./_add-to-unscopables')(KEY);

},{"./_add-to-unscopables":231,"./_array-methods":238,"./_export":259}],361:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $forEach = require('./_array-methods')(0);
var STRICT = require('./_strict-method')([].forEach, true);

$export($export.P + $export.F * !STRICT, 'Array', {
  // 22.1.3.10 / 15.4.4.18 Array.prototype.forEach(callbackfn [, thisArg])
  forEach: function forEach(callbackfn /* , thisArg */) {
    return $forEach(this, callbackfn, arguments[1]);
  }
});

},{"./_array-methods":238,"./_export":259,"./_strict-method":328}],362:[function(require,module,exports){
arguments[4][212][0].apply(exports,arguments)
},{"./_create-property":250,"./_ctx":251,"./_export":259,"./_is-array-iter":274,"./_iter-call":279,"./_iter-detect":282,"./_to-length":341,"./_to-object":342,"./core.get-iterator-method":353,"dup":212}],363:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $indexOf = require('./_array-includes')(false);
var $native = [].indexOf;
var NEGATIVE_ZERO = !!$native && 1 / [1].indexOf(1, -0) < 0;

$export($export.P + $export.F * (NEGATIVE_ZERO || !require('./_strict-method')($native)), 'Array', {
  // 22.1.3.11 / 15.4.4.14 Array.prototype.indexOf(searchElement [, fromIndex])
  indexOf: function indexOf(searchElement /* , fromIndex = 0 */) {
    return NEGATIVE_ZERO
    // convert -0 to +0
    ? $native.apply(this, arguments) || 0 : $indexOf(this, searchElement, arguments[1]);
  }
});

},{"./_array-includes":237,"./_export":259,"./_strict-method":328}],364:[function(require,module,exports){
'use strict';

// 22.1.2.2 / 15.4.3.2 Array.isArray(arg)
var $export = require('./_export');

$export($export.S, 'Array', { isArray: require('./_is-array') });

},{"./_export":259,"./_is-array":275}],365:[function(require,module,exports){
arguments[4][213][0].apply(exports,arguments)
},{"./_add-to-unscopables":231,"./_iter-define":281,"./_iter-step":283,"./_iterators":284,"./_to-iobject":340,"dup":213}],366:[function(require,module,exports){
'use strict';
// 22.1.3.13 Array.prototype.join(separator)

var $export = require('./_export');
var toIObject = require('./_to-iobject');
var arrayJoin = [].join;

// fallback for not array-like strings
$export($export.P + $export.F * (require('./_iobject') != Object || !require('./_strict-method')(arrayJoin)), 'Array', {
  join: function join(separator) {
    return arrayJoin.call(toIObject(this), separator === undefined ? ',' : separator);
  }
});

},{"./_export":259,"./_iobject":273,"./_strict-method":328,"./_to-iobject":340}],367:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var toIObject = require('./_to-iobject');
var toInteger = require('./_to-integer');
var toLength = require('./_to-length');
var $native = [].lastIndexOf;
var NEGATIVE_ZERO = !!$native && 1 / [1].lastIndexOf(1, -0) < 0;

$export($export.P + $export.F * (NEGATIVE_ZERO || !require('./_strict-method')($native)), 'Array', {
  // 22.1.3.14 / 15.4.4.15 Array.prototype.lastIndexOf(searchElement [, fromIndex])
  lastIndexOf: function lastIndexOf(searchElement /* , fromIndex = @[*-1] */) {
    // convert -0 to +0
    if (NEGATIVE_ZERO) return $native.apply(this, arguments) || 0;
    var O = toIObject(this);
    var length = toLength(O.length);
    var index = length - 1;
    if (arguments.length > 1) index = Math.min(index, toInteger(arguments[1]));
    if (index < 0) index = length + index;
    for (; index >= 0; index--) {
      if (index in O) if (O[index] === searchElement) return index || 0;
    }return -1;
  }
});

},{"./_export":259,"./_strict-method":328,"./_to-integer":339,"./_to-iobject":340,"./_to-length":341}],368:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $map = require('./_array-methods')(1);

$export($export.P + $export.F * !require('./_strict-method')([].map, true), 'Array', {
  // 22.1.3.15 / 15.4.4.19 Array.prototype.map(callbackfn [, thisArg])
  map: function map(callbackfn /* , thisArg */) {
    return $map(this, callbackfn, arguments[1]);
  }
});

},{"./_array-methods":238,"./_export":259,"./_strict-method":328}],369:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var createProperty = require('./_create-property');

// WebKit Array.of isn't generic
$export($export.S + $export.F * require('./_fails')(function () {
  function F() {/* empty */}
  return !(Array.of.call(F) instanceof F);
}), 'Array', {
  // 22.1.2.3 Array.of( ...items)
  of: function of() /* ...args */{
    var index = 0;
    var aLen = arguments.length;
    var result = new (typeof this == 'function' ? this : Array)(aLen);
    while (aLen > index) {
      createProperty(result, index, arguments[index++]);
    }result.length = aLen;
    return result;
  }
});

},{"./_create-property":250,"./_export":259,"./_fails":261}],370:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $reduce = require('./_array-reduce');

$export($export.P + $export.F * !require('./_strict-method')([].reduceRight, true), 'Array', {
  // 22.1.3.19 / 15.4.4.22 Array.prototype.reduceRight(callbackfn [, initialValue])
  reduceRight: function reduceRight(callbackfn /* , initialValue */) {
    return $reduce(this, callbackfn, arguments.length, arguments[1], true);
  }
});

},{"./_array-reduce":239,"./_export":259,"./_strict-method":328}],371:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $reduce = require('./_array-reduce');

$export($export.P + $export.F * !require('./_strict-method')([].reduce, true), 'Array', {
  // 22.1.3.18 / 15.4.4.21 Array.prototype.reduce(callbackfn [, initialValue])
  reduce: function reduce(callbackfn /* , initialValue */) {
    return $reduce(this, callbackfn, arguments.length, arguments[1], false);
  }
});

},{"./_array-reduce":239,"./_export":259,"./_strict-method":328}],372:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var html = require('./_html');
var cof = require('./_cof');
var toAbsoluteIndex = require('./_to-absolute-index');
var toLength = require('./_to-length');
var arraySlice = [].slice;

// fallback for not array-like ES3 strings and DOM objects
$export($export.P + $export.F * require('./_fails')(function () {
  if (html) arraySlice.call(html);
}), 'Array', {
  slice: function slice(begin, end) {
    var len = toLength(this.length);
    var klass = cof(this);
    end = end === undefined ? len : end;
    if (klass == 'Array') return arraySlice.call(this, begin, end);
    var start = toAbsoluteIndex(begin, len);
    var upTo = toAbsoluteIndex(end, len);
    var size = toLength(upTo - start);
    var cloned = new Array(size);
    var i = 0;
    for (; i < size; i++) {
      cloned[i] = klass == 'String' ? this.charAt(start + i) : this[start + i];
    }return cloned;
  }
});

},{"./_cof":244,"./_export":259,"./_fails":261,"./_html":269,"./_to-absolute-index":337,"./_to-length":341}],373:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $some = require('./_array-methods')(3);

$export($export.P + $export.F * !require('./_strict-method')([].some, true), 'Array', {
  // 22.1.3.23 / 15.4.4.17 Array.prototype.some(callbackfn [, thisArg])
  some: function some(callbackfn /* , thisArg */) {
    return $some(this, callbackfn, arguments[1]);
  }
});

},{"./_array-methods":238,"./_export":259,"./_strict-method":328}],374:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var aFunction = require('./_a-function');
var toObject = require('./_to-object');
var fails = require('./_fails');
var $sort = [].sort;
var test = [1, 2, 3];

$export($export.P + $export.F * (fails(function () {
  // IE8-
  test.sort(undefined);
}) || !fails(function () {
  // V8 bug
  test.sort(null);
  // Old WebKit
}) || !require('./_strict-method')($sort)), 'Array', {
  // 22.1.3.25 Array.prototype.sort(comparefn)
  sort: function sort(comparefn) {
    return comparefn === undefined ? $sort.call(toObject(this)) : $sort.call(toObject(this), aFunction(comparefn));
  }
});

},{"./_a-function":229,"./_export":259,"./_fails":261,"./_strict-method":328,"./_to-object":342}],375:[function(require,module,exports){
'use strict';

require('./_set-species')('Array');

},{"./_set-species":323}],376:[function(require,module,exports){
'use strict';

// 20.3.3.1 / 15.9.4.4 Date.now()
var $export = require('./_export');

$export($export.S, 'Date', { now: function now() {
    return new Date().getTime();
  } });

},{"./_export":259}],377:[function(require,module,exports){
'use strict';

// 20.3.4.36 / 15.9.5.43 Date.prototype.toISOString()
var $export = require('./_export');
var toISOString = require('./_date-to-iso-string');

// PhantomJS / old WebKit has a broken implementations
$export($export.P + $export.F * (Date.prototype.toISOString !== toISOString), 'Date', {
  toISOString: toISOString
});

},{"./_date-to-iso-string":252,"./_export":259}],378:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var toObject = require('./_to-object');
var toPrimitive = require('./_to-primitive');

$export($export.P + $export.F * require('./_fails')(function () {
  return new Date(NaN).toJSON() !== null || Date.prototype.toJSON.call({ toISOString: function toISOString() {
      return 1;
    } }) !== 1;
}), 'Date', {
  // eslint-disable-next-line no-unused-vars
  toJSON: function toJSON(key) {
    var O = toObject(this);
    var pv = toPrimitive(O);
    return typeof pv == 'number' && !isFinite(pv) ? null : O.toISOString();
  }
});

},{"./_export":259,"./_fails":261,"./_to-object":342,"./_to-primitive":343}],379:[function(require,module,exports){
'use strict';

var TO_PRIMITIVE = require('./_wks')('toPrimitive');
var proto = Date.prototype;

if (!(TO_PRIMITIVE in proto)) require('./_hide')(proto, TO_PRIMITIVE, require('./_date-to-primitive'));

},{"./_date-to-primitive":253,"./_hide":268,"./_wks":352}],380:[function(require,module,exports){
'use strict';

var DateProto = Date.prototype;
var INVALID_DATE = 'Invalid Date';
var TO_STRING = 'toString';
var $toString = DateProto[TO_STRING];
var getTime = DateProto.getTime;
if (new Date(NaN) + '' != INVALID_DATE) {
  require('./_redefine')(DateProto, TO_STRING, function toString() {
    var value = getTime.call(this);
    // eslint-disable-next-line no-self-compare
    return value === value ? $toString.call(this) : INVALID_DATE;
  });
}

},{"./_redefine":317}],381:[function(require,module,exports){
'use strict';

// 19.2.3.2 / 15.3.4.5 Function.prototype.bind(thisArg, args...)
var $export = require('./_export');

$export($export.P, 'Function', { bind: require('./_bind') });

},{"./_bind":242,"./_export":259}],382:[function(require,module,exports){
'use strict';

var isObject = require('./_is-object');
var getPrototypeOf = require('./_object-gpo');
var HAS_INSTANCE = require('./_wks')('hasInstance');
var FunctionProto = Function.prototype;
// 19.2.3.6 Function.prototype[@@hasInstance](V)
if (!(HAS_INSTANCE in FunctionProto)) require('./_object-dp').f(FunctionProto, HAS_INSTANCE, { value: function value(O) {
    if (typeof this != 'function' || !isObject(O)) return false;
    if (!isObject(this.prototype)) return O instanceof this;
    // for environment w/o native `@@hasInstance` logic enough `instanceof`, but add this:
    while (O = getPrototypeOf(O)) {
      if (this.prototype === O) return true;
    }return false;
  } });

},{"./_is-object":277,"./_object-dp":297,"./_object-gpo":304,"./_wks":352}],383:[function(require,module,exports){
'use strict';

var dP = require('./_object-dp').f;
var FProto = Function.prototype;
var nameRE = /^\s*function ([^ (]*)/;
var NAME = 'name';

// 19.2.4.2 name
NAME in FProto || require('./_descriptors') && dP(FProto, NAME, {
  configurable: true,
  get: function get() {
    try {
      return ('' + this).match(nameRE)[1];
    } catch (e) {
      return '';
    }
  }
});

},{"./_descriptors":255,"./_object-dp":297}],384:[function(require,module,exports){
'use strict';

var strong = require('./_collection-strong');
var validate = require('./_validate-collection');
var MAP = 'Map';

// 23.1 Map Objects
module.exports = require('./_collection')(MAP, function (get) {
  return function Map() {
    return get(this, arguments.length > 0 ? arguments[0] : undefined);
  };
}, {
  // 23.1.3.6 Map.prototype.get(key)
  get: function get(key) {
    var entry = strong.getEntry(validate(this, MAP), key);
    return entry && entry.v;
  },
  // 23.1.3.9 Map.prototype.set(key, value)
  set: function set(key, value) {
    return strong.def(validate(this, MAP), key === 0 ? 0 : key, value);
  }
}, strong, true);

},{"./_collection":248,"./_collection-strong":245,"./_validate-collection":349}],385:[function(require,module,exports){
'use strict';

// 20.2.2.3 Math.acosh(x)
var $export = require('./_export');
var log1p = require('./_math-log1p');
var sqrt = Math.sqrt;
var $acosh = Math.acosh;

$export($export.S + $export.F * !($acosh
// V8 bug: https://code.google.com/p/v8/issues/detail?id=3509
&& Math.floor($acosh(Number.MAX_VALUE)) == 710
// Tor Browser bug: Math.acosh(Infinity) -> NaN
&& $acosh(Infinity) == Infinity), 'Math', {
  acosh: function acosh(x) {
    return (x = +x) < 1 ? NaN : x > 94906265.62425156 ? Math.log(x) + Math.LN2 : log1p(x - 1 + sqrt(x - 1) * sqrt(x + 1));
  }
});

},{"./_export":259,"./_math-log1p":288}],386:[function(require,module,exports){
'use strict';

// 20.2.2.5 Math.asinh(x)
var $export = require('./_export');
var $asinh = Math.asinh;

function asinh(x) {
  return !isFinite(x = +x) || x == 0 ? x : x < 0 ? -asinh(-x) : Math.log(x + Math.sqrt(x * x + 1));
}

// Tor Browser bug: Math.asinh(0) -> -0
$export($export.S + $export.F * !($asinh && 1 / $asinh(0) > 0), 'Math', { asinh: asinh });

},{"./_export":259}],387:[function(require,module,exports){
'use strict';

// 20.2.2.7 Math.atanh(x)
var $export = require('./_export');
var $atanh = Math.atanh;

// Tor Browser bug: Math.atanh(-0) -> 0
$export($export.S + $export.F * !($atanh && 1 / $atanh(-0) < 0), 'Math', {
  atanh: function atanh(x) {
    return (x = +x) == 0 ? x : Math.log((1 + x) / (1 - x)) / 2;
  }
});

},{"./_export":259}],388:[function(require,module,exports){
'use strict';

// 20.2.2.9 Math.cbrt(x)
var $export = require('./_export');
var sign = require('./_math-sign');

$export($export.S, 'Math', {
  cbrt: function cbrt(x) {
    return sign(x = +x) * Math.pow(Math.abs(x), 1 / 3);
  }
});

},{"./_export":259,"./_math-sign":290}],389:[function(require,module,exports){
'use strict';

// 20.2.2.11 Math.clz32(x)
var $export = require('./_export');

$export($export.S, 'Math', {
  clz32: function clz32(x) {
    return (x >>>= 0) ? 31 - Math.floor(Math.log(x + 0.5) * Math.LOG2E) : 32;
  }
});

},{"./_export":259}],390:[function(require,module,exports){
'use strict';

// 20.2.2.12 Math.cosh(x)
var $export = require('./_export');
var exp = Math.exp;

$export($export.S, 'Math', {
  cosh: function cosh(x) {
    return (exp(x = +x) + exp(-x)) / 2;
  }
});

},{"./_export":259}],391:[function(require,module,exports){
'use strict';

// 20.2.2.14 Math.expm1(x)
var $export = require('./_export');
var $expm1 = require('./_math-expm1');

$export($export.S + $export.F * ($expm1 != Math.expm1), 'Math', { expm1: $expm1 });

},{"./_export":259,"./_math-expm1":286}],392:[function(require,module,exports){
'use strict';

// 20.2.2.16 Math.fround(x)
var $export = require('./_export');

$export($export.S, 'Math', { fround: require('./_math-fround') });

},{"./_export":259,"./_math-fround":287}],393:[function(require,module,exports){
'use strict';

// 20.2.2.17 Math.hypot([value1[, value2[, … ]]])
var $export = require('./_export');
var abs = Math.abs;

$export($export.S, 'Math', {
  hypot: function hypot(value1, value2) {
    // eslint-disable-line no-unused-vars
    var sum = 0;
    var i = 0;
    var aLen = arguments.length;
    var larg = 0;
    var arg, div;
    while (i < aLen) {
      arg = abs(arguments[i++]);
      if (larg < arg) {
        div = larg / arg;
        sum = sum * div * div + 1;
        larg = arg;
      } else if (arg > 0) {
        div = arg / larg;
        sum += div * div;
      } else sum += arg;
    }
    return larg === Infinity ? Infinity : larg * Math.sqrt(sum);
  }
});

},{"./_export":259}],394:[function(require,module,exports){
'use strict';

// 20.2.2.18 Math.imul(x, y)
var $export = require('./_export');
var $imul = Math.imul;

// some WebKit versions fails with big numbers, some has wrong arity
$export($export.S + $export.F * require('./_fails')(function () {
  return $imul(0xffffffff, 5) != -5 || $imul.length != 2;
}), 'Math', {
  imul: function imul(x, y) {
    var UINT16 = 0xffff;
    var xn = +x;
    var yn = +y;
    var xl = UINT16 & xn;
    var yl = UINT16 & yn;
    return 0 | xl * yl + ((UINT16 & xn >>> 16) * yl + xl * (UINT16 & yn >>> 16) << 16 >>> 0);
  }
});

},{"./_export":259,"./_fails":261}],395:[function(require,module,exports){
'use strict';

// 20.2.2.21 Math.log10(x)
var $export = require('./_export');

$export($export.S, 'Math', {
  log10: function log10(x) {
    return Math.log(x) * Math.LOG10E;
  }
});

},{"./_export":259}],396:[function(require,module,exports){
'use strict';

// 20.2.2.20 Math.log1p(x)
var $export = require('./_export');

$export($export.S, 'Math', { log1p: require('./_math-log1p') });

},{"./_export":259,"./_math-log1p":288}],397:[function(require,module,exports){
'use strict';

// 20.2.2.22 Math.log2(x)
var $export = require('./_export');

$export($export.S, 'Math', {
  log2: function log2(x) {
    return Math.log(x) / Math.LN2;
  }
});

},{"./_export":259}],398:[function(require,module,exports){
'use strict';

// 20.2.2.28 Math.sign(x)
var $export = require('./_export');

$export($export.S, 'Math', { sign: require('./_math-sign') });

},{"./_export":259,"./_math-sign":290}],399:[function(require,module,exports){
'use strict';

// 20.2.2.30 Math.sinh(x)
var $export = require('./_export');
var expm1 = require('./_math-expm1');
var exp = Math.exp;

// V8 near Chromium 38 has a problem with very small numbers
$export($export.S + $export.F * require('./_fails')(function () {
  return !Math.sinh(-2e-17) != -2e-17;
}), 'Math', {
  sinh: function sinh(x) {
    return Math.abs(x = +x) < 1 ? (expm1(x) - expm1(-x)) / 2 : (exp(x - 1) - exp(-x - 1)) * (Math.E / 2);
  }
});

},{"./_export":259,"./_fails":261,"./_math-expm1":286}],400:[function(require,module,exports){
'use strict';

// 20.2.2.33 Math.tanh(x)
var $export = require('./_export');
var expm1 = require('./_math-expm1');
var exp = Math.exp;

$export($export.S, 'Math', {
  tanh: function tanh(x) {
    var a = expm1(x = +x);
    var b = expm1(-x);
    return a == Infinity ? 1 : b == Infinity ? -1 : (a - b) / (exp(x) + exp(-x));
  }
});

},{"./_export":259,"./_math-expm1":286}],401:[function(require,module,exports){
'use strict';

// 20.2.2.34 Math.trunc(x)
var $export = require('./_export');

$export($export.S, 'Math', {
  trunc: function trunc(it) {
    return (it > 0 ? Math.floor : Math.ceil)(it);
  }
});

},{"./_export":259}],402:[function(require,module,exports){
'use strict';

var global = require('./_global');
var has = require('./_has');
var cof = require('./_cof');
var inheritIfRequired = require('./_inherit-if-required');
var toPrimitive = require('./_to-primitive');
var fails = require('./_fails');
var gOPN = require('./_object-gopn').f;
var gOPD = require('./_object-gopd').f;
var dP = require('./_object-dp').f;
var $trim = require('./_string-trim').trim;
var NUMBER = 'Number';
var $Number = global[NUMBER];
var Base = $Number;
var proto = $Number.prototype;
// Opera ~12 has broken Object#toString
var BROKEN_COF = cof(require('./_object-create')(proto)) == NUMBER;
var TRIM = 'trim' in String.prototype;

// 7.1.3 ToNumber(argument)
var toNumber = function toNumber(argument) {
  var it = toPrimitive(argument, false);
  if (typeof it == 'string' && it.length > 2) {
    it = TRIM ? it.trim() : $trim(it, 3);
    var first = it.charCodeAt(0);
    var third, radix, maxCode;
    if (first === 43 || first === 45) {
      third = it.charCodeAt(2);
      if (third === 88 || third === 120) return NaN; // Number('+0x1') should be NaN, old V8 fix
    } else if (first === 48) {
      switch (it.charCodeAt(1)) {
        case 66:case 98:
          radix = 2;maxCode = 49;break; // fast equal /^0b[01]+$/i
        case 79:case 111:
          radix = 8;maxCode = 55;break; // fast equal /^0o[0-7]+$/i
        default:
          return +it;
      }
      for (var digits = it.slice(2), i = 0, l = digits.length, code; i < l; i++) {
        code = digits.charCodeAt(i);
        // parseInt parses a string to a first unavailable symbol
        // but ToNumber should return NaN if a string contains unavailable symbols
        if (code < 48 || code > maxCode) return NaN;
      }return parseInt(digits, radix);
    }
  }return +it;
};

if (!$Number(' 0o1') || !$Number('0b1') || $Number('+0x1')) {
  $Number = function Number(value) {
    var it = arguments.length < 1 ? 0 : value;
    var that = this;
    return that instanceof $Number
    // check on 1..constructor(foo) case
    && (BROKEN_COF ? fails(function () {
      proto.valueOf.call(that);
    }) : cof(that) != NUMBER) ? inheritIfRequired(new Base(toNumber(it)), that, $Number) : toNumber(it);
  };
  for (var keys = require('./_descriptors') ? gOPN(Base) : (
  // ES3:
  'MAX_VALUE,MIN_VALUE,NaN,NEGATIVE_INFINITY,POSITIVE_INFINITY,' +
  // ES6 (in case, if modules with ES6 Number statics required before):
  'EPSILON,isFinite,isInteger,isNaN,isSafeInteger,MAX_SAFE_INTEGER,' + 'MIN_SAFE_INTEGER,parseFloat,parseInt,isInteger').split(','), j = 0, key; keys.length > j; j++) {
    if (has(Base, key = keys[j]) && !has($Number, key)) {
      dP($Number, key, gOPD(Base, key));
    }
  }
  $Number.prototype = proto;
  proto.constructor = $Number;
  require('./_redefine')(global, NUMBER, $Number);
}

},{"./_cof":244,"./_descriptors":255,"./_fails":261,"./_global":266,"./_has":267,"./_inherit-if-required":271,"./_object-create":296,"./_object-dp":297,"./_object-gopd":300,"./_object-gopn":302,"./_redefine":317,"./_string-trim":334,"./_to-primitive":343}],403:[function(require,module,exports){
'use strict';

// 20.1.2.1 Number.EPSILON
var $export = require('./_export');

$export($export.S, 'Number', { EPSILON: Math.pow(2, -52) });

},{"./_export":259}],404:[function(require,module,exports){
'use strict';

// 20.1.2.2 Number.isFinite(number)
var $export = require('./_export');
var _isFinite = require('./_global').isFinite;

$export($export.S, 'Number', {
  isFinite: function isFinite(it) {
    return typeof it == 'number' && _isFinite(it);
  }
});

},{"./_export":259,"./_global":266}],405:[function(require,module,exports){
'use strict';

// 20.1.2.3 Number.isInteger(number)
var $export = require('./_export');

$export($export.S, 'Number', { isInteger: require('./_is-integer') });

},{"./_export":259,"./_is-integer":276}],406:[function(require,module,exports){
'use strict';

// 20.1.2.4 Number.isNaN(number)
var $export = require('./_export');

$export($export.S, 'Number', {
  isNaN: function isNaN(number) {
    // eslint-disable-next-line no-self-compare
    return number != number;
  }
});

},{"./_export":259}],407:[function(require,module,exports){
'use strict';

// 20.1.2.5 Number.isSafeInteger(number)
var $export = require('./_export');
var isInteger = require('./_is-integer');
var abs = Math.abs;

$export($export.S, 'Number', {
  isSafeInteger: function isSafeInteger(number) {
    return isInteger(number) && abs(number) <= 0x1fffffffffffff;
  }
});

},{"./_export":259,"./_is-integer":276}],408:[function(require,module,exports){
'use strict';

// 20.1.2.6 Number.MAX_SAFE_INTEGER
var $export = require('./_export');

$export($export.S, 'Number', { MAX_SAFE_INTEGER: 0x1fffffffffffff });

},{"./_export":259}],409:[function(require,module,exports){
'use strict';

// 20.1.2.10 Number.MIN_SAFE_INTEGER
var $export = require('./_export');

$export($export.S, 'Number', { MIN_SAFE_INTEGER: -0x1fffffffffffff });

},{"./_export":259}],410:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $parseFloat = require('./_parse-float');
// 20.1.2.12 Number.parseFloat(string)
$export($export.S + $export.F * (Number.parseFloat != $parseFloat), 'Number', { parseFloat: $parseFloat });

},{"./_export":259,"./_parse-float":311}],411:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $parseInt = require('./_parse-int');
// 20.1.2.13 Number.parseInt(string, radix)
$export($export.S + $export.F * (Number.parseInt != $parseInt), 'Number', { parseInt: $parseInt });

},{"./_export":259,"./_parse-int":312}],412:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var toInteger = require('./_to-integer');
var aNumberValue = require('./_a-number-value');
var repeat = require('./_string-repeat');
var $toFixed = 1.0.toFixed;
var floor = Math.floor;
var data = [0, 0, 0, 0, 0, 0];
var ERROR = 'Number.toFixed: incorrect invocation!';
var ZERO = '0';

var multiply = function multiply(n, c) {
  var i = -1;
  var c2 = c;
  while (++i < 6) {
    c2 += n * data[i];
    data[i] = c2 % 1e7;
    c2 = floor(c2 / 1e7);
  }
};
var divide = function divide(n) {
  var i = 6;
  var c = 0;
  while (--i >= 0) {
    c += data[i];
    data[i] = floor(c / n);
    c = c % n * 1e7;
  }
};
var numToString = function numToString() {
  var i = 6;
  var s = '';
  while (--i >= 0) {
    if (s !== '' || i === 0 || data[i] !== 0) {
      var t = String(data[i]);
      s = s === '' ? t : s + repeat.call(ZERO, 7 - t.length) + t;
    }
  }return s;
};
var pow = function pow(x, n, acc) {
  return n === 0 ? acc : n % 2 === 1 ? pow(x, n - 1, acc * x) : pow(x * x, n / 2, acc);
};
var log = function log(x) {
  var n = 0;
  var x2 = x;
  while (x2 >= 4096) {
    n += 12;
    x2 /= 4096;
  }
  while (x2 >= 2) {
    n += 1;
    x2 /= 2;
  }return n;
};

$export($export.P + $export.F * (!!$toFixed && (0.00008.toFixed(3) !== '0.000' || 0.9.toFixed(0) !== '1' || 1.255.toFixed(2) !== '1.25' || 1000000000000000128.0.toFixed(0) !== '1000000000000000128') || !require('./_fails')(function () {
  // V8 ~ Android 4.3-
  $toFixed.call({});
})), 'Number', {
  toFixed: function toFixed(fractionDigits) {
    var x = aNumberValue(this, ERROR);
    var f = toInteger(fractionDigits);
    var s = '';
    var m = ZERO;
    var e, z, j, k;
    if (f < 0 || f > 20) throw RangeError(ERROR);
    // eslint-disable-next-line no-self-compare
    if (x != x) return 'NaN';
    if (x <= -1e21 || x >= 1e21) return String(x);
    if (x < 0) {
      s = '-';
      x = -x;
    }
    if (x > 1e-21) {
      e = log(x * pow(2, 69, 1)) - 69;
      z = e < 0 ? x * pow(2, -e, 1) : x / pow(2, e, 1);
      z *= 0x10000000000000;
      e = 52 - e;
      if (e > 0) {
        multiply(0, z);
        j = f;
        while (j >= 7) {
          multiply(1e7, 0);
          j -= 7;
        }
        multiply(pow(10, j, 1), 0);
        j = e - 1;
        while (j >= 23) {
          divide(1 << 23);
          j -= 23;
        }
        divide(1 << j);
        multiply(1, 1);
        divide(2);
        m = numToString();
      } else {
        multiply(0, z);
        multiply(1 << -e, 0);
        m = numToString() + repeat.call(ZERO, f);
      }
    }
    if (f > 0) {
      k = m.length;
      m = s + (k <= f ? '0.' + repeat.call(ZERO, f - k) + m : m.slice(0, k - f) + '.' + m.slice(k - f));
    } else {
      m = s + m;
    }return m;
  }
});

},{"./_a-number-value":230,"./_export":259,"./_fails":261,"./_string-repeat":333,"./_to-integer":339}],413:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $fails = require('./_fails');
var aNumberValue = require('./_a-number-value');
var $toPrecision = 1.0.toPrecision;

$export($export.P + $export.F * ($fails(function () {
  // IE7-
  return $toPrecision.call(1, undefined) !== '1';
}) || !$fails(function () {
  // V8 ~ Android 4.3-
  $toPrecision.call({});
})), 'Number', {
  toPrecision: function toPrecision(precision) {
    var that = aNumberValue(this, 'Number#toPrecision: incorrect invocation!');
    return precision === undefined ? $toPrecision.call(that) : $toPrecision.call(that, precision);
  }
});

},{"./_a-number-value":230,"./_export":259,"./_fails":261}],414:[function(require,module,exports){
arguments[4][214][0].apply(exports,arguments)
},{"./_export":259,"./_object-assign":295,"dup":214}],415:[function(require,module,exports){
arguments[4][215][0].apply(exports,arguments)
},{"./_export":259,"./_object-create":296,"dup":215}],416:[function(require,module,exports){
'use strict';

var $export = require('./_export');
// 19.1.2.3 / 15.2.3.7 Object.defineProperties(O, Properties)
$export($export.S + $export.F * !require('./_descriptors'), 'Object', { defineProperties: require('./_object-dps') });

},{"./_descriptors":255,"./_export":259,"./_object-dps":298}],417:[function(require,module,exports){
arguments[4][216][0].apply(exports,arguments)
},{"./_descriptors":255,"./_export":259,"./_object-dp":297,"dup":216}],418:[function(require,module,exports){
'use strict';

// 19.1.2.5 Object.freeze(O)
var isObject = require('./_is-object');
var meta = require('./_meta').onFreeze;

require('./_object-sap')('freeze', function ($freeze) {
  return function freeze(it) {
    return $freeze && isObject(it) ? $freeze(meta(it)) : it;
  };
});

},{"./_is-object":277,"./_meta":291,"./_object-sap":308}],419:[function(require,module,exports){
'use strict';

// 19.1.2.6 Object.getOwnPropertyDescriptor(O, P)
var toIObject = require('./_to-iobject');
var $getOwnPropertyDescriptor = require('./_object-gopd').f;

require('./_object-sap')('getOwnPropertyDescriptor', function () {
  return function getOwnPropertyDescriptor(it, key) {
    return $getOwnPropertyDescriptor(toIObject(it), key);
  };
});

},{"./_object-gopd":300,"./_object-sap":308,"./_to-iobject":340}],420:[function(require,module,exports){
'use strict';

// 19.1.2.7 Object.getOwnPropertyNames(O)
require('./_object-sap')('getOwnPropertyNames', function () {
  return require('./_object-gopn-ext').f;
});

},{"./_object-gopn-ext":301,"./_object-sap":308}],421:[function(require,module,exports){
arguments[4][217][0].apply(exports,arguments)
},{"./_object-gpo":304,"./_object-sap":308,"./_to-object":342,"dup":217}],422:[function(require,module,exports){
'use strict';

// 19.1.2.11 Object.isExtensible(O)
var isObject = require('./_is-object');

require('./_object-sap')('isExtensible', function ($isExtensible) {
  return function isExtensible(it) {
    return isObject(it) ? $isExtensible ? $isExtensible(it) : true : false;
  };
});

},{"./_is-object":277,"./_object-sap":308}],423:[function(require,module,exports){
'use strict';

// 19.1.2.12 Object.isFrozen(O)
var isObject = require('./_is-object');

require('./_object-sap')('isFrozen', function ($isFrozen) {
  return function isFrozen(it) {
    return isObject(it) ? $isFrozen ? $isFrozen(it) : false : true;
  };
});

},{"./_is-object":277,"./_object-sap":308}],424:[function(require,module,exports){
'use strict';

// 19.1.2.13 Object.isSealed(O)
var isObject = require('./_is-object');

require('./_object-sap')('isSealed', function ($isSealed) {
  return function isSealed(it) {
    return isObject(it) ? $isSealed ? $isSealed(it) : false : true;
  };
});

},{"./_is-object":277,"./_object-sap":308}],425:[function(require,module,exports){
'use strict';

// 19.1.3.10 Object.is(value1, value2)
var $export = require('./_export');
$export($export.S, 'Object', { is: require('./_same-value') });

},{"./_export":259,"./_same-value":319}],426:[function(require,module,exports){
arguments[4][218][0].apply(exports,arguments)
},{"./_object-keys":306,"./_object-sap":308,"./_to-object":342,"dup":218}],427:[function(require,module,exports){
'use strict';

// 19.1.2.15 Object.preventExtensions(O)
var isObject = require('./_is-object');
var meta = require('./_meta').onFreeze;

require('./_object-sap')('preventExtensions', function ($preventExtensions) {
  return function preventExtensions(it) {
    return $preventExtensions && isObject(it) ? $preventExtensions(meta(it)) : it;
  };
});

},{"./_is-object":277,"./_meta":291,"./_object-sap":308}],428:[function(require,module,exports){
'use strict';

// 19.1.2.17 Object.seal(O)
var isObject = require('./_is-object');
var meta = require('./_meta').onFreeze;

require('./_object-sap')('seal', function ($seal) {
  return function seal(it) {
    return $seal && isObject(it) ? $seal(meta(it)) : it;
  };
});

},{"./_is-object":277,"./_meta":291,"./_object-sap":308}],429:[function(require,module,exports){
arguments[4][219][0].apply(exports,arguments)
},{"./_export":259,"./_set-proto":322,"dup":219}],430:[function(require,module,exports){
'use strict';
// 19.1.3.6 Object.prototype.toString()

var classof = require('./_classof');
var test = {};
test[require('./_wks')('toStringTag')] = 'z';
if (test + '' != '[object z]') {
  require('./_redefine')(Object.prototype, 'toString', function toString() {
    return '[object ' + classof(this) + ']';
  }, true);
}

},{"./_classof":243,"./_redefine":317,"./_wks":352}],431:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $parseFloat = require('./_parse-float');
// 18.2.4 parseFloat(string)
$export($export.G + $export.F * (parseFloat != $parseFloat), { parseFloat: $parseFloat });

},{"./_export":259,"./_parse-float":311}],432:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $parseInt = require('./_parse-int');
// 18.2.5 parseInt(string, radix)
$export($export.G + $export.F * (parseInt != $parseInt), { parseInt: $parseInt });

},{"./_export":259,"./_parse-int":312}],433:[function(require,module,exports){
arguments[4][221][0].apply(exports,arguments)
},{"./_a-function":229,"./_an-instance":232,"./_classof":243,"./_core":249,"./_ctx":251,"./_export":259,"./_for-of":265,"./_global":266,"./_is-object":277,"./_iter-detect":282,"./_library":285,"./_microtask":293,"./_new-promise-capability":294,"./_perform":313,"./_promise-resolve":314,"./_redefine-all":316,"./_set-species":323,"./_set-to-string-tag":324,"./_species-constructor":327,"./_task":336,"./_user-agent":348,"./_wks":352,"dup":221}],434:[function(require,module,exports){
'use strict';

// 26.1.1 Reflect.apply(target, thisArgument, argumentsList)
var $export = require('./_export');
var aFunction = require('./_a-function');
var anObject = require('./_an-object');
var rApply = (require('./_global').Reflect || {}).apply;
var fApply = Function.apply;
// MS Edge argumentsList argument is optional
$export($export.S + $export.F * !require('./_fails')(function () {
  rApply(function () {/* empty */});
}), 'Reflect', {
  apply: function apply(target, thisArgument, argumentsList) {
    var T = aFunction(target);
    var L = anObject(argumentsList);
    return rApply ? rApply(T, thisArgument, L) : fApply.call(T, thisArgument, L);
  }
});

},{"./_a-function":229,"./_an-object":233,"./_export":259,"./_fails":261,"./_global":266}],435:[function(require,module,exports){
'use strict';

// 26.1.2 Reflect.construct(target, argumentsList [, newTarget])
var $export = require('./_export');
var create = require('./_object-create');
var aFunction = require('./_a-function');
var anObject = require('./_an-object');
var isObject = require('./_is-object');
var fails = require('./_fails');
var bind = require('./_bind');
var rConstruct = (require('./_global').Reflect || {}).construct;

// MS Edge supports only 2 arguments and argumentsList argument is optional
// FF Nightly sets third argument as `new.target`, but does not create `this` from it
var NEW_TARGET_BUG = fails(function () {
  function F() {/* empty */}
  return !(rConstruct(function () {/* empty */}, [], F) instanceof F);
});
var ARGS_BUG = !fails(function () {
  rConstruct(function () {/* empty */});
});

$export($export.S + $export.F * (NEW_TARGET_BUG || ARGS_BUG), 'Reflect', {
  construct: function construct(Target, args /* , newTarget */) {
    aFunction(Target);
    anObject(args);
    var newTarget = arguments.length < 3 ? Target : aFunction(arguments[2]);
    if (ARGS_BUG && !NEW_TARGET_BUG) return rConstruct(Target, args, newTarget);
    if (Target == newTarget) {
      // w/o altered newTarget, optimization for 0-4 arguments
      switch (args.length) {
        case 0:
          return new Target();
        case 1:
          return new Target(args[0]);
        case 2:
          return new Target(args[0], args[1]);
        case 3:
          return new Target(args[0], args[1], args[2]);
        case 4:
          return new Target(args[0], args[1], args[2], args[3]);
      }
      // w/o altered newTarget, lot of arguments case
      var $args = [null];
      $args.push.apply($args, args);
      return new (bind.apply(Target, $args))();
    }
    // with altered newTarget, not support built-in constructors
    var proto = newTarget.prototype;
    var instance = create(isObject(proto) ? proto : Object.prototype);
    var result = Function.apply.call(Target, instance, args);
    return isObject(result) ? result : instance;
  }
});

},{"./_a-function":229,"./_an-object":233,"./_bind":242,"./_export":259,"./_fails":261,"./_global":266,"./_is-object":277,"./_object-create":296}],436:[function(require,module,exports){
'use strict';

// 26.1.3 Reflect.defineProperty(target, propertyKey, attributes)
var dP = require('./_object-dp');
var $export = require('./_export');
var anObject = require('./_an-object');
var toPrimitive = require('./_to-primitive');

// MS Edge has broken Reflect.defineProperty - throwing instead of returning false
$export($export.S + $export.F * require('./_fails')(function () {
  // eslint-disable-next-line no-undef
  Reflect.defineProperty(dP.f({}, 1, { value: 1 }), 1, { value: 2 });
}), 'Reflect', {
  defineProperty: function defineProperty(target, propertyKey, attributes) {
    anObject(target);
    propertyKey = toPrimitive(propertyKey, true);
    anObject(attributes);
    try {
      dP.f(target, propertyKey, attributes);
      return true;
    } catch (e) {
      return false;
    }
  }
});

},{"./_an-object":233,"./_export":259,"./_fails":261,"./_object-dp":297,"./_to-primitive":343}],437:[function(require,module,exports){
'use strict';

// 26.1.4 Reflect.deleteProperty(target, propertyKey)
var $export = require('./_export');
var gOPD = require('./_object-gopd').f;
var anObject = require('./_an-object');

$export($export.S, 'Reflect', {
  deleteProperty: function deleteProperty(target, propertyKey) {
    var desc = gOPD(anObject(target), propertyKey);
    return desc && !desc.configurable ? false : delete target[propertyKey];
  }
});

},{"./_an-object":233,"./_export":259,"./_object-gopd":300}],438:[function(require,module,exports){
'use strict';
// 26.1.5 Reflect.enumerate(target)

var $export = require('./_export');
var anObject = require('./_an-object');
var Enumerate = function Enumerate(iterated) {
  this._t = anObject(iterated); // target
  this._i = 0; // next index
  var keys = this._k = []; // keys
  var key;
  for (key in iterated) {
    keys.push(key);
  }
};
require('./_iter-create')(Enumerate, 'Object', function () {
  var that = this;
  var keys = that._k;
  var key;
  do {
    if (that._i >= keys.length) return { value: undefined, done: true };
  } while (!((key = keys[that._i++]) in that._t));
  return { value: key, done: false };
});

$export($export.S, 'Reflect', {
  enumerate: function enumerate(target) {
    return new Enumerate(target);
  }
});

},{"./_an-object":233,"./_export":259,"./_iter-create":280}],439:[function(require,module,exports){
'use strict';

// 26.1.7 Reflect.getOwnPropertyDescriptor(target, propertyKey)
var gOPD = require('./_object-gopd');
var $export = require('./_export');
var anObject = require('./_an-object');

$export($export.S, 'Reflect', {
  getOwnPropertyDescriptor: function getOwnPropertyDescriptor(target, propertyKey) {
    return gOPD.f(anObject(target), propertyKey);
  }
});

},{"./_an-object":233,"./_export":259,"./_object-gopd":300}],440:[function(require,module,exports){
'use strict';

// 26.1.8 Reflect.getPrototypeOf(target)
var $export = require('./_export');
var getProto = require('./_object-gpo');
var anObject = require('./_an-object');

$export($export.S, 'Reflect', {
  getPrototypeOf: function getPrototypeOf(target) {
    return getProto(anObject(target));
  }
});

},{"./_an-object":233,"./_export":259,"./_object-gpo":304}],441:[function(require,module,exports){
'use strict';

// 26.1.6 Reflect.get(target, propertyKey [, receiver])
var gOPD = require('./_object-gopd');
var getPrototypeOf = require('./_object-gpo');
var has = require('./_has');
var $export = require('./_export');
var isObject = require('./_is-object');
var anObject = require('./_an-object');

function get(target, propertyKey /* , receiver */) {
  var receiver = arguments.length < 3 ? target : arguments[2];
  var desc, proto;
  if (anObject(target) === receiver) return target[propertyKey];
  if (desc = gOPD.f(target, propertyKey)) return has(desc, 'value') ? desc.value : desc.get !== undefined ? desc.get.call(receiver) : undefined;
  if (isObject(proto = getPrototypeOf(target))) return get(proto, propertyKey, receiver);
}

$export($export.S, 'Reflect', { get: get });

},{"./_an-object":233,"./_export":259,"./_has":267,"./_is-object":277,"./_object-gopd":300,"./_object-gpo":304}],442:[function(require,module,exports){
'use strict';

// 26.1.9 Reflect.has(target, propertyKey)
var $export = require('./_export');

$export($export.S, 'Reflect', {
  has: function has(target, propertyKey) {
    return propertyKey in target;
  }
});

},{"./_export":259}],443:[function(require,module,exports){
'use strict';

// 26.1.10 Reflect.isExtensible(target)
var $export = require('./_export');
var anObject = require('./_an-object');
var $isExtensible = Object.isExtensible;

$export($export.S, 'Reflect', {
  isExtensible: function isExtensible(target) {
    anObject(target);
    return $isExtensible ? $isExtensible(target) : true;
  }
});

},{"./_an-object":233,"./_export":259}],444:[function(require,module,exports){
'use strict';

// 26.1.11 Reflect.ownKeys(target)
var $export = require('./_export');

$export($export.S, 'Reflect', { ownKeys: require('./_own-keys') });

},{"./_export":259,"./_own-keys":310}],445:[function(require,module,exports){
'use strict';

// 26.1.12 Reflect.preventExtensions(target)
var $export = require('./_export');
var anObject = require('./_an-object');
var $preventExtensions = Object.preventExtensions;

$export($export.S, 'Reflect', {
  preventExtensions: function preventExtensions(target) {
    anObject(target);
    try {
      if ($preventExtensions) $preventExtensions(target);
      return true;
    } catch (e) {
      return false;
    }
  }
});

},{"./_an-object":233,"./_export":259}],446:[function(require,module,exports){
'use strict';

// 26.1.14 Reflect.setPrototypeOf(target, proto)
var $export = require('./_export');
var setProto = require('./_set-proto');

if (setProto) $export($export.S, 'Reflect', {
  setPrototypeOf: function setPrototypeOf(target, proto) {
    setProto.check(target, proto);
    try {
      setProto.set(target, proto);
      return true;
    } catch (e) {
      return false;
    }
  }
});

},{"./_export":259,"./_set-proto":322}],447:[function(require,module,exports){
'use strict';

// 26.1.13 Reflect.set(target, propertyKey, V [, receiver])
var dP = require('./_object-dp');
var gOPD = require('./_object-gopd');
var getPrototypeOf = require('./_object-gpo');
var has = require('./_has');
var $export = require('./_export');
var createDesc = require('./_property-desc');
var anObject = require('./_an-object');
var isObject = require('./_is-object');

function set(target, propertyKey, V /* , receiver */) {
  var receiver = arguments.length < 4 ? target : arguments[3];
  var ownDesc = gOPD.f(anObject(target), propertyKey);
  var existingDescriptor, proto;
  if (!ownDesc) {
    if (isObject(proto = getPrototypeOf(target))) {
      return set(proto, propertyKey, V, receiver);
    }
    ownDesc = createDesc(0);
  }
  if (has(ownDesc, 'value')) {
    if (ownDesc.writable === false || !isObject(receiver)) return false;
    if (existingDescriptor = gOPD.f(receiver, propertyKey)) {
      if (existingDescriptor.get || existingDescriptor.set || existingDescriptor.writable === false) return false;
      existingDescriptor.value = V;
      dP.f(receiver, propertyKey, existingDescriptor);
    } else dP.f(receiver, propertyKey, createDesc(0, V));
    return true;
  }
  return ownDesc.set === undefined ? false : (ownDesc.set.call(receiver, V), true);
}

$export($export.S, 'Reflect', { set: set });

},{"./_an-object":233,"./_export":259,"./_has":267,"./_is-object":277,"./_object-dp":297,"./_object-gopd":300,"./_object-gpo":304,"./_property-desc":315}],448:[function(require,module,exports){
'use strict';

var global = require('./_global');
var inheritIfRequired = require('./_inherit-if-required');
var dP = require('./_object-dp').f;
var gOPN = require('./_object-gopn').f;
var isRegExp = require('./_is-regexp');
var $flags = require('./_flags');
var $RegExp = global.RegExp;
var Base = $RegExp;
var proto = $RegExp.prototype;
var re1 = /a/g;
var re2 = /a/g;
// "new" creates a new object, old webkit buggy here
var CORRECT_NEW = new $RegExp(re1) !== re1;

if (require('./_descriptors') && (!CORRECT_NEW || require('./_fails')(function () {
  re2[require('./_wks')('match')] = false;
  // RegExp constructor can alter flags and IsRegExp works correct with @@match
  return $RegExp(re1) != re1 || $RegExp(re2) == re2 || $RegExp(re1, 'i') != '/a/i';
}))) {
  $RegExp = function RegExp(p, f) {
    var tiRE = this instanceof $RegExp;
    var piRE = isRegExp(p);
    var fiU = f === undefined;
    return !tiRE && piRE && p.constructor === $RegExp && fiU ? p : inheritIfRequired(CORRECT_NEW ? new Base(piRE && !fiU ? p.source : p, f) : Base((piRE = p instanceof $RegExp) ? p.source : p, piRE && fiU ? $flags.call(p) : f), tiRE ? this : proto, $RegExp);
  };
  var proxy = function proxy(key) {
    key in $RegExp || dP($RegExp, key, {
      configurable: true,
      get: function get() {
        return Base[key];
      },
      set: function set(it) {
        Base[key] = it;
      }
    });
  };
  for (var keys = gOPN(Base), i = 0; keys.length > i;) {
    proxy(keys[i++]);
  }proto.constructor = $RegExp;
  $RegExp.prototype = proto;
  require('./_redefine')(global, 'RegExp', $RegExp);
}

require('./_set-species')('RegExp');

},{"./_descriptors":255,"./_fails":261,"./_flags":263,"./_global":266,"./_inherit-if-required":271,"./_is-regexp":278,"./_object-dp":297,"./_object-gopn":302,"./_redefine":317,"./_set-species":323,"./_wks":352}],449:[function(require,module,exports){
'use strict';

// 21.2.5.3 get RegExp.prototype.flags()
if (require('./_descriptors') && /./g.flags != 'g') require('./_object-dp').f(RegExp.prototype, 'flags', {
  configurable: true,
  get: require('./_flags')
});

},{"./_descriptors":255,"./_flags":263,"./_object-dp":297}],450:[function(require,module,exports){
'use strict';

// @@match logic
require('./_fix-re-wks')('match', 1, function (defined, MATCH, $match) {
  // 21.1.3.11 String.prototype.match(regexp)
  return [function match(regexp) {
    'use strict';

    var O = defined(this);
    var fn = regexp == undefined ? undefined : regexp[MATCH];
    return fn !== undefined ? fn.call(regexp, O) : new RegExp(regexp)[MATCH](String(O));
  }, $match];
});

},{"./_fix-re-wks":262}],451:[function(require,module,exports){
'use strict';

// @@replace logic
require('./_fix-re-wks')('replace', 2, function (defined, REPLACE, $replace) {
  // 21.1.3.14 String.prototype.replace(searchValue, replaceValue)
  return [function replace(searchValue, replaceValue) {
    'use strict';

    var O = defined(this);
    var fn = searchValue == undefined ? undefined : searchValue[REPLACE];
    return fn !== undefined ? fn.call(searchValue, O, replaceValue) : $replace.call(String(O), searchValue, replaceValue);
  }, $replace];
});

},{"./_fix-re-wks":262}],452:[function(require,module,exports){
'use strict';

// @@search logic
require('./_fix-re-wks')('search', 1, function (defined, SEARCH, $search) {
  // 21.1.3.15 String.prototype.search(regexp)
  return [function search(regexp) {
    'use strict';

    var O = defined(this);
    var fn = regexp == undefined ? undefined : regexp[SEARCH];
    return fn !== undefined ? fn.call(regexp, O) : new RegExp(regexp)[SEARCH](String(O));
  }, $search];
});

},{"./_fix-re-wks":262}],453:[function(require,module,exports){
'use strict';

// @@split logic
require('./_fix-re-wks')('split', 2, function (defined, SPLIT, $split) {
  'use strict';

  var isRegExp = require('./_is-regexp');
  var _split = $split;
  var $push = [].push;
  var $SPLIT = 'split';
  var LENGTH = 'length';
  var LAST_INDEX = 'lastIndex';
  if ('abbc'[$SPLIT](/(b)*/)[1] == 'c' || 'test'[$SPLIT](/(?:)/, -1)[LENGTH] != 4 || 'ab'[$SPLIT](/(?:ab)*/)[LENGTH] != 2 || '.'[$SPLIT](/(.?)(.?)/)[LENGTH] != 4 || '.'[$SPLIT](/()()/)[LENGTH] > 1 || ''[$SPLIT](/.?/)[LENGTH]) {
    var NPCG = /()??/.exec('')[1] === undefined; // nonparticipating capturing group
    // based on es5-shim implementation, need to rework it
    $split = function $split(separator, limit) {
      var string = String(this);
      if (separator === undefined && limit === 0) return [];
      // If `separator` is not a regex, use native split
      if (!isRegExp(separator)) return _split.call(string, separator, limit);
      var output = [];
      var flags = (separator.ignoreCase ? 'i' : '') + (separator.multiline ? 'm' : '') + (separator.unicode ? 'u' : '') + (separator.sticky ? 'y' : '');
      var lastLastIndex = 0;
      var splitLimit = limit === undefined ? 4294967295 : limit >>> 0;
      // Make `global` and avoid `lastIndex` issues by working with a copy
      var separatorCopy = new RegExp(separator.source, flags + 'g');
      var separator2, match, lastIndex, lastLength, i;
      // Doesn't need flags gy, but they don't hurt
      if (!NPCG) separator2 = new RegExp('^' + separatorCopy.source + '$(?!\\s)', flags);
      while (match = separatorCopy.exec(string)) {
        // `separatorCopy.lastIndex` is not reliable cross-browser
        lastIndex = match.index + match[0][LENGTH];
        if (lastIndex > lastLastIndex) {
          output.push(string.slice(lastLastIndex, match.index));
          // Fix browsers whose `exec` methods don't consistently return `undefined` for NPCG
          // eslint-disable-next-line no-loop-func
          if (!NPCG && match[LENGTH] > 1) match[0].replace(separator2, function () {
            for (i = 1; i < arguments[LENGTH] - 2; i++) {
              if (arguments[i] === undefined) match[i] = undefined;
            }
          });
          if (match[LENGTH] > 1 && match.index < string[LENGTH]) $push.apply(output, match.slice(1));
          lastLength = match[0][LENGTH];
          lastLastIndex = lastIndex;
          if (output[LENGTH] >= splitLimit) break;
        }
        if (separatorCopy[LAST_INDEX] === match.index) separatorCopy[LAST_INDEX]++; // Avoid an infinite loop
      }
      if (lastLastIndex === string[LENGTH]) {
        if (lastLength || !separatorCopy.test('')) output.push('');
      } else output.push(string.slice(lastLastIndex));
      return output[LENGTH] > splitLimit ? output.slice(0, splitLimit) : output;
    };
    // Chakra, V8
  } else if ('0'[$SPLIT](undefined, 0)[LENGTH]) {
    $split = function $split(separator, limit) {
      return separator === undefined && limit === 0 ? [] : _split.call(this, separator, limit);
    };
  }
  // 21.1.3.17 String.prototype.split(separator, limit)
  return [function split(separator, limit) {
    var O = defined(this);
    var fn = separator == undefined ? undefined : separator[SPLIT];
    return fn !== undefined ? fn.call(separator, O, limit) : $split.call(String(O), separator, limit);
  }, $split];
});

},{"./_fix-re-wks":262,"./_is-regexp":278}],454:[function(require,module,exports){
'use strict';

require('./es6.regexp.flags');
var anObject = require('./_an-object');
var $flags = require('./_flags');
var DESCRIPTORS = require('./_descriptors');
var TO_STRING = 'toString';
var $toString = /./[TO_STRING];

var define = function define(fn) {
  require('./_redefine')(RegExp.prototype, TO_STRING, fn, true);
};

// 21.2.5.14 RegExp.prototype.toString()
if (require('./_fails')(function () {
  return $toString.call({ source: 'a', flags: 'b' }) != '/a/b';
})) {
  define(function toString() {
    var R = anObject(this);
    return '/'.concat(R.source, '/', 'flags' in R ? R.flags : !DESCRIPTORS && R instanceof RegExp ? $flags.call(R) : undefined);
  });
  // FF44- RegExp#toString has a wrong name
} else if ($toString.name != TO_STRING) {
  define(function toString() {
    return $toString.call(this);
  });
}

},{"./_an-object":233,"./_descriptors":255,"./_fails":261,"./_flags":263,"./_redefine":317,"./es6.regexp.flags":449}],455:[function(require,module,exports){
'use strict';

var strong = require('./_collection-strong');
var validate = require('./_validate-collection');
var SET = 'Set';

// 23.2 Set Objects
module.exports = require('./_collection')(SET, function (get) {
  return function Set() {
    return get(this, arguments.length > 0 ? arguments[0] : undefined);
  };
}, {
  // 23.2.3.1 Set.prototype.add(value)
  add: function add(value) {
    return strong.def(validate(this, SET), value = value === 0 ? 0 : value, value);
  }
}, strong);

},{"./_collection":248,"./_collection-strong":245,"./_validate-collection":349}],456:[function(require,module,exports){
'use strict';
// B.2.3.2 String.prototype.anchor(name)

require('./_string-html')('anchor', function (createHTML) {
  return function anchor(name) {
    return createHTML(this, 'a', 'name', name);
  };
});

},{"./_string-html":331}],457:[function(require,module,exports){
'use strict';
// B.2.3.3 String.prototype.big()

require('./_string-html')('big', function (createHTML) {
  return function big() {
    return createHTML(this, 'big', '', '');
  };
});

},{"./_string-html":331}],458:[function(require,module,exports){
'use strict';
// B.2.3.4 String.prototype.blink()

require('./_string-html')('blink', function (createHTML) {
  return function blink() {
    return createHTML(this, 'blink', '', '');
  };
});

},{"./_string-html":331}],459:[function(require,module,exports){
'use strict';
// B.2.3.5 String.prototype.bold()

require('./_string-html')('bold', function (createHTML) {
  return function bold() {
    return createHTML(this, 'b', '', '');
  };
});

},{"./_string-html":331}],460:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $at = require('./_string-at')(false);
$export($export.P, 'String', {
  // 21.1.3.3 String.prototype.codePointAt(pos)
  codePointAt: function codePointAt(pos) {
    return $at(this, pos);
  }
});

},{"./_export":259,"./_string-at":329}],461:[function(require,module,exports){
// 21.1.3.6 String.prototype.endsWith(searchString [, endPosition])
'use strict';

var $export = require('./_export');
var toLength = require('./_to-length');
var context = require('./_string-context');
var ENDS_WITH = 'endsWith';
var $endsWith = ''[ENDS_WITH];

$export($export.P + $export.F * require('./_fails-is-regexp')(ENDS_WITH), 'String', {
  endsWith: function endsWith(searchString /* , endPosition = @length */) {
    var that = context(this, searchString, ENDS_WITH);
    var endPosition = arguments.length > 1 ? arguments[1] : undefined;
    var len = toLength(that.length);
    var end = endPosition === undefined ? len : Math.min(toLength(endPosition), len);
    var search = String(searchString);
    return $endsWith ? $endsWith.call(that, search, end) : that.slice(end - search.length, end) === search;
  }
});

},{"./_export":259,"./_fails-is-regexp":260,"./_string-context":330,"./_to-length":341}],462:[function(require,module,exports){
'use strict';
// B.2.3.6 String.prototype.fixed()

require('./_string-html')('fixed', function (createHTML) {
  return function fixed() {
    return createHTML(this, 'tt', '', '');
  };
});

},{"./_string-html":331}],463:[function(require,module,exports){
'use strict';
// B.2.3.7 String.prototype.fontcolor(color)

require('./_string-html')('fontcolor', function (createHTML) {
  return function fontcolor(color) {
    return createHTML(this, 'font', 'color', color);
  };
});

},{"./_string-html":331}],464:[function(require,module,exports){
'use strict';
// B.2.3.8 String.prototype.fontsize(size)

require('./_string-html')('fontsize', function (createHTML) {
  return function fontsize(size) {
    return createHTML(this, 'font', 'size', size);
  };
});

},{"./_string-html":331}],465:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var toAbsoluteIndex = require('./_to-absolute-index');
var fromCharCode = String.fromCharCode;
var $fromCodePoint = String.fromCodePoint;

// length should be 1, old FF problem
$export($export.S + $export.F * (!!$fromCodePoint && $fromCodePoint.length != 1), 'String', {
  // 21.1.2.2 String.fromCodePoint(...codePoints)
  fromCodePoint: function fromCodePoint(x) {
    // eslint-disable-line no-unused-vars
    var res = [];
    var aLen = arguments.length;
    var i = 0;
    var code;
    while (aLen > i) {
      code = +arguments[i++];
      if (toAbsoluteIndex(code, 0x10ffff) !== code) throw RangeError(code + ' is not a valid code point');
      res.push(code < 0x10000 ? fromCharCode(code) : fromCharCode(((code -= 0x10000) >> 10) + 0xd800, code % 0x400 + 0xdc00));
    }return res.join('');
  }
});

},{"./_export":259,"./_to-absolute-index":337}],466:[function(require,module,exports){
// 21.1.3.7 String.prototype.includes(searchString, position = 0)
'use strict';

var $export = require('./_export');
var context = require('./_string-context');
var INCLUDES = 'includes';

$export($export.P + $export.F * require('./_fails-is-regexp')(INCLUDES), 'String', {
  includes: function includes(searchString /* , position = 0 */) {
    return !!~context(this, searchString, INCLUDES).indexOf(searchString, arguments.length > 1 ? arguments[1] : undefined);
  }
});

},{"./_export":259,"./_fails-is-regexp":260,"./_string-context":330}],467:[function(require,module,exports){
'use strict';
// B.2.3.9 String.prototype.italics()

require('./_string-html')('italics', function (createHTML) {
  return function italics() {
    return createHTML(this, 'i', '', '');
  };
});

},{"./_string-html":331}],468:[function(require,module,exports){
arguments[4][222][0].apply(exports,arguments)
},{"./_iter-define":281,"./_string-at":329,"dup":222}],469:[function(require,module,exports){
'use strict';
// B.2.3.10 String.prototype.link(url)

require('./_string-html')('link', function (createHTML) {
  return function link(url) {
    return createHTML(this, 'a', 'href', url);
  };
});

},{"./_string-html":331}],470:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var toIObject = require('./_to-iobject');
var toLength = require('./_to-length');

$export($export.S, 'String', {
  // 21.1.2.4 String.raw(callSite, ...substitutions)
  raw: function raw(callSite) {
    var tpl = toIObject(callSite.raw);
    var len = toLength(tpl.length);
    var aLen = arguments.length;
    var res = [];
    var i = 0;
    while (len > i) {
      res.push(String(tpl[i++]));
      if (i < aLen) res.push(String(arguments[i]));
    }return res.join('');
  }
});

},{"./_export":259,"./_to-iobject":340,"./_to-length":341}],471:[function(require,module,exports){
'use strict';

var $export = require('./_export');

$export($export.P, 'String', {
  // 21.1.3.13 String.prototype.repeat(count)
  repeat: require('./_string-repeat')
});

},{"./_export":259,"./_string-repeat":333}],472:[function(require,module,exports){
'use strict';
// B.2.3.11 String.prototype.small()

require('./_string-html')('small', function (createHTML) {
  return function small() {
    return createHTML(this, 'small', '', '');
  };
});

},{"./_string-html":331}],473:[function(require,module,exports){
// 21.1.3.18 String.prototype.startsWith(searchString [, position ])
'use strict';

var $export = require('./_export');
var toLength = require('./_to-length');
var context = require('./_string-context');
var STARTS_WITH = 'startsWith';
var $startsWith = ''[STARTS_WITH];

$export($export.P + $export.F * require('./_fails-is-regexp')(STARTS_WITH), 'String', {
  startsWith: function startsWith(searchString /* , position = 0 */) {
    var that = context(this, searchString, STARTS_WITH);
    var index = toLength(Math.min(arguments.length > 1 ? arguments[1] : undefined, that.length));
    var search = String(searchString);
    return $startsWith ? $startsWith.call(that, search, index) : that.slice(index, index + search.length) === search;
  }
});

},{"./_export":259,"./_fails-is-regexp":260,"./_string-context":330,"./_to-length":341}],474:[function(require,module,exports){
'use strict';
// B.2.3.12 String.prototype.strike()

require('./_string-html')('strike', function (createHTML) {
  return function strike() {
    return createHTML(this, 'strike', '', '');
  };
});

},{"./_string-html":331}],475:[function(require,module,exports){
'use strict';
// B.2.3.13 String.prototype.sub()

require('./_string-html')('sub', function (createHTML) {
  return function sub() {
    return createHTML(this, 'sub', '', '');
  };
});

},{"./_string-html":331}],476:[function(require,module,exports){
'use strict';
// B.2.3.14 String.prototype.sup()

require('./_string-html')('sup', function (createHTML) {
  return function sup() {
    return createHTML(this, 'sup', '', '');
  };
});

},{"./_string-html":331}],477:[function(require,module,exports){
'use strict';
// 21.1.3.25 String.prototype.trim()

require('./_string-trim')('trim', function ($trim) {
  return function trim() {
    return $trim(this, 3);
  };
});

},{"./_string-trim":334}],478:[function(require,module,exports){
arguments[4][223][0].apply(exports,arguments)
},{"./_an-object":233,"./_descriptors":255,"./_enum-keys":258,"./_export":259,"./_fails":261,"./_global":266,"./_has":267,"./_hide":268,"./_is-array":275,"./_is-object":277,"./_library":285,"./_meta":291,"./_object-create":296,"./_object-dp":297,"./_object-gopd":300,"./_object-gopn":302,"./_object-gopn-ext":301,"./_object-gops":303,"./_object-keys":306,"./_object-pie":307,"./_property-desc":315,"./_redefine":317,"./_set-to-string-tag":324,"./_shared":326,"./_to-iobject":340,"./_to-primitive":343,"./_uid":347,"./_wks":352,"./_wks-define":350,"./_wks-ext":351,"dup":223}],479:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $typed = require('./_typed');
var buffer = require('./_typed-buffer');
var anObject = require('./_an-object');
var toAbsoluteIndex = require('./_to-absolute-index');
var toLength = require('./_to-length');
var isObject = require('./_is-object');
var ArrayBuffer = require('./_global').ArrayBuffer;
var speciesConstructor = require('./_species-constructor');
var $ArrayBuffer = buffer.ArrayBuffer;
var $DataView = buffer.DataView;
var $isView = $typed.ABV && ArrayBuffer.isView;
var $slice = $ArrayBuffer.prototype.slice;
var VIEW = $typed.VIEW;
var ARRAY_BUFFER = 'ArrayBuffer';

$export($export.G + $export.W + $export.F * (ArrayBuffer !== $ArrayBuffer), { ArrayBuffer: $ArrayBuffer });

$export($export.S + $export.F * !$typed.CONSTR, ARRAY_BUFFER, {
  // 24.1.3.1 ArrayBuffer.isView(arg)
  isView: function isView(it) {
    return $isView && $isView(it) || isObject(it) && VIEW in it;
  }
});

$export($export.P + $export.U + $export.F * require('./_fails')(function () {
  return !new $ArrayBuffer(2).slice(1, undefined).byteLength;
}), ARRAY_BUFFER, {
  // 24.1.4.3 ArrayBuffer.prototype.slice(start, end)
  slice: function slice(start, end) {
    if ($slice !== undefined && end === undefined) return $slice.call(anObject(this), start); // FF fix
    var len = anObject(this).byteLength;
    var first = toAbsoluteIndex(start, len);
    var fin = toAbsoluteIndex(end === undefined ? len : end, len);
    var result = new (speciesConstructor(this, $ArrayBuffer))(toLength(fin - first));
    var viewS = new $DataView(this);
    var viewT = new $DataView(result);
    var index = 0;
    while (first < fin) {
      viewT.setUint8(index++, viewS.getUint8(first++));
    }return result;
  }
});

require('./_set-species')(ARRAY_BUFFER);

},{"./_an-object":233,"./_export":259,"./_fails":261,"./_global":266,"./_is-object":277,"./_set-species":323,"./_species-constructor":327,"./_to-absolute-index":337,"./_to-length":341,"./_typed":346,"./_typed-buffer":345}],480:[function(require,module,exports){
'use strict';

var $export = require('./_export');
$export($export.G + $export.W + $export.F * !require('./_typed').ABV, {
  DataView: require('./_typed-buffer').DataView
});

},{"./_export":259,"./_typed":346,"./_typed-buffer":345}],481:[function(require,module,exports){
'use strict';

require('./_typed-array')('Float32', 4, function (init) {
  return function Float32Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":344}],482:[function(require,module,exports){
'use strict';

require('./_typed-array')('Float64', 8, function (init) {
  return function Float64Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":344}],483:[function(require,module,exports){
'use strict';

require('./_typed-array')('Int16', 2, function (init) {
  return function Int16Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":344}],484:[function(require,module,exports){
'use strict';

require('./_typed-array')('Int32', 4, function (init) {
  return function Int32Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":344}],485:[function(require,module,exports){
'use strict';

require('./_typed-array')('Int8', 1, function (init) {
  return function Int8Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":344}],486:[function(require,module,exports){
'use strict';

require('./_typed-array')('Uint16', 2, function (init) {
  return function Uint16Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":344}],487:[function(require,module,exports){
'use strict';

require('./_typed-array')('Uint32', 4, function (init) {
  return function Uint32Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":344}],488:[function(require,module,exports){
'use strict';

require('./_typed-array')('Uint8', 1, function (init) {
  return function Uint8Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":344}],489:[function(require,module,exports){
'use strict';

require('./_typed-array')('Uint8', 1, function (init) {
  return function Uint8ClampedArray(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
}, true);

},{"./_typed-array":344}],490:[function(require,module,exports){
'use strict';

var each = require('./_array-methods')(0);
var redefine = require('./_redefine');
var meta = require('./_meta');
var assign = require('./_object-assign');
var weak = require('./_collection-weak');
var isObject = require('./_is-object');
var fails = require('./_fails');
var validate = require('./_validate-collection');
var WEAK_MAP = 'WeakMap';
var getWeak = meta.getWeak;
var isExtensible = Object.isExtensible;
var uncaughtFrozenStore = weak.ufstore;
var tmp = {};
var InternalMap;

var wrapper = function wrapper(get) {
  return function WeakMap() {
    return get(this, arguments.length > 0 ? arguments[0] : undefined);
  };
};

var methods = {
  // 23.3.3.3 WeakMap.prototype.get(key)
  get: function get(key) {
    if (isObject(key)) {
      var data = getWeak(key);
      if (data === true) return uncaughtFrozenStore(validate(this, WEAK_MAP)).get(key);
      return data ? data[this._i] : undefined;
    }
  },
  // 23.3.3.5 WeakMap.prototype.set(key, value)
  set: function set(key, value) {
    return weak.def(validate(this, WEAK_MAP), key, value);
  }
};

// 23.3 WeakMap Objects
var $WeakMap = module.exports = require('./_collection')(WEAK_MAP, wrapper, methods, weak, true, true);

// IE11 WeakMap frozen keys fix
if (fails(function () {
  return new $WeakMap().set((Object.freeze || Object)(tmp), 7).get(tmp) != 7;
})) {
  InternalMap = weak.getConstructor(wrapper, WEAK_MAP);
  assign(InternalMap.prototype, methods);
  meta.NEED = true;
  each(['delete', 'has', 'get', 'set'], function (key) {
    var proto = $WeakMap.prototype;
    var method = proto[key];
    redefine(proto, key, function (a, b) {
      // store frozen objects on internal weakmap shim
      if (isObject(a) && !isExtensible(a)) {
        if (!this._f) this._f = new InternalMap();
        var result = this._f[key](a, b);
        return key == 'set' ? this : result;
        // store all the rest on native weakmap
      }return method.call(this, a, b);
    });
  });
}

},{"./_array-methods":238,"./_collection":248,"./_collection-weak":247,"./_fails":261,"./_is-object":277,"./_meta":291,"./_object-assign":295,"./_redefine":317,"./_validate-collection":349}],491:[function(require,module,exports){
'use strict';

var weak = require('./_collection-weak');
var validate = require('./_validate-collection');
var WEAK_SET = 'WeakSet';

// 23.4 WeakSet Objects
require('./_collection')(WEAK_SET, function (get) {
  return function WeakSet() {
    return get(this, arguments.length > 0 ? arguments[0] : undefined);
  };
}, {
  // 23.4.3.1 WeakSet.prototype.add(value)
  add: function add(value) {
    return weak.def(validate(this, WEAK_SET), value, true);
  }
}, weak, false, true);

},{"./_collection":248,"./_collection-weak":247,"./_validate-collection":349}],492:[function(require,module,exports){
'use strict';
// https://tc39.github.io/proposal-flatMap/#sec-Array.prototype.flatMap

var $export = require('./_export');
var flattenIntoArray = require('./_flatten-into-array');
var toObject = require('./_to-object');
var toLength = require('./_to-length');
var aFunction = require('./_a-function');
var arraySpeciesCreate = require('./_array-species-create');

$export($export.P, 'Array', {
  flatMap: function flatMap(callbackfn /* , thisArg */) {
    var O = toObject(this);
    var sourceLen, A;
    aFunction(callbackfn);
    sourceLen = toLength(O.length);
    A = arraySpeciesCreate(O, 0);
    flattenIntoArray(A, O, O, sourceLen, 0, 1, callbackfn, arguments[1]);
    return A;
  }
});

require('./_add-to-unscopables')('flatMap');

},{"./_a-function":229,"./_add-to-unscopables":231,"./_array-species-create":241,"./_export":259,"./_flatten-into-array":264,"./_to-length":341,"./_to-object":342}],493:[function(require,module,exports){
'use strict';
// https://tc39.github.io/proposal-flatMap/#sec-Array.prototype.flatten

var $export = require('./_export');
var flattenIntoArray = require('./_flatten-into-array');
var toObject = require('./_to-object');
var toLength = require('./_to-length');
var toInteger = require('./_to-integer');
var arraySpeciesCreate = require('./_array-species-create');

$export($export.P, 'Array', {
  flatten: function flatten() /* depthArg = 1 */{
    var depthArg = arguments[0];
    var O = toObject(this);
    var sourceLen = toLength(O.length);
    var A = arraySpeciesCreate(O, 0);
    flattenIntoArray(A, O, O, sourceLen, 0, depthArg === undefined ? 1 : toInteger(depthArg));
    return A;
  }
});

require('./_add-to-unscopables')('flatten');

},{"./_add-to-unscopables":231,"./_array-species-create":241,"./_export":259,"./_flatten-into-array":264,"./_to-integer":339,"./_to-length":341,"./_to-object":342}],494:[function(require,module,exports){
'use strict';
// https://github.com/tc39/Array.prototype.includes

var $export = require('./_export');
var $includes = require('./_array-includes')(true);

$export($export.P, 'Array', {
  includes: function includes(el /* , fromIndex = 0 */) {
    return $includes(this, el, arguments.length > 1 ? arguments[1] : undefined);
  }
});

require('./_add-to-unscopables')('includes');

},{"./_add-to-unscopables":231,"./_array-includes":237,"./_export":259}],495:[function(require,module,exports){
'use strict';

// https://github.com/rwaldron/tc39-notes/blob/master/es6/2014-09/sept-25.md#510-globalasap-for-enqueuing-a-microtask
var $export = require('./_export');
var microtask = require('./_microtask')();
var process = require('./_global').process;
var isNode = require('./_cof')(process) == 'process';

$export($export.G, {
  asap: function asap(fn) {
    var domain = isNode && process.domain;
    microtask(domain ? domain.bind(fn) : fn);
  }
});

},{"./_cof":244,"./_export":259,"./_global":266,"./_microtask":293}],496:[function(require,module,exports){
'use strict';

// https://github.com/ljharb/proposal-is-error
var $export = require('./_export');
var cof = require('./_cof');

$export($export.S, 'Error', {
  isError: function isError(it) {
    return cof(it) === 'Error';
  }
});

},{"./_cof":244,"./_export":259}],497:[function(require,module,exports){
'use strict';

// https://github.com/tc39/proposal-global
var $export = require('./_export');

$export($export.G, { global: require('./_global') });

},{"./_export":259,"./_global":266}],498:[function(require,module,exports){
'use strict';

// https://tc39.github.io/proposal-setmap-offrom/#sec-map.from
require('./_set-collection-from')('Map');

},{"./_set-collection-from":320}],499:[function(require,module,exports){
'use strict';

// https://tc39.github.io/proposal-setmap-offrom/#sec-map.of
require('./_set-collection-of')('Map');

},{"./_set-collection-of":321}],500:[function(require,module,exports){
'use strict';

// https://github.com/DavidBruant/Map-Set.prototype.toJSON
var $export = require('./_export');

$export($export.P + $export.R, 'Map', { toJSON: require('./_collection-to-json')('Map') });

},{"./_collection-to-json":246,"./_export":259}],501:[function(require,module,exports){
'use strict';

// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');

$export($export.S, 'Math', {
  clamp: function clamp(x, lower, upper) {
    return Math.min(upper, Math.max(lower, x));
  }
});

},{"./_export":259}],502:[function(require,module,exports){
'use strict';

// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');

$export($export.S, 'Math', { DEG_PER_RAD: Math.PI / 180 });

},{"./_export":259}],503:[function(require,module,exports){
'use strict';

// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');
var RAD_PER_DEG = 180 / Math.PI;

$export($export.S, 'Math', {
  degrees: function degrees(radians) {
    return radians * RAD_PER_DEG;
  }
});

},{"./_export":259}],504:[function(require,module,exports){
'use strict';

// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');
var scale = require('./_math-scale');
var fround = require('./_math-fround');

$export($export.S, 'Math', {
  fscale: function fscale(x, inLow, inHigh, outLow, outHigh) {
    return fround(scale(x, inLow, inHigh, outLow, outHigh));
  }
});

},{"./_export":259,"./_math-fround":287,"./_math-scale":289}],505:[function(require,module,exports){
'use strict';

// https://gist.github.com/BrendanEich/4294d5c212a6d2254703
var $export = require('./_export');

$export($export.S, 'Math', {
  iaddh: function iaddh(x0, x1, y0, y1) {
    var $x0 = x0 >>> 0;
    var $x1 = x1 >>> 0;
    var $y0 = y0 >>> 0;
    return $x1 + (y1 >>> 0) + (($x0 & $y0 | ($x0 | $y0) & ~($x0 + $y0 >>> 0)) >>> 31) | 0;
  }
});

},{"./_export":259}],506:[function(require,module,exports){
'use strict';

// https://gist.github.com/BrendanEich/4294d5c212a6d2254703
var $export = require('./_export');

$export($export.S, 'Math', {
  imulh: function imulh(u, v) {
    var UINT16 = 0xffff;
    var $u = +u;
    var $v = +v;
    var u0 = $u & UINT16;
    var v0 = $v & UINT16;
    var u1 = $u >> 16;
    var v1 = $v >> 16;
    var t = (u1 * v0 >>> 0) + (u0 * v0 >>> 16);
    return u1 * v1 + (t >> 16) + ((u0 * v1 >>> 0) + (t & UINT16) >> 16);
  }
});

},{"./_export":259}],507:[function(require,module,exports){
'use strict';

// https://gist.github.com/BrendanEich/4294d5c212a6d2254703
var $export = require('./_export');

$export($export.S, 'Math', {
  isubh: function isubh(x0, x1, y0, y1) {
    var $x0 = x0 >>> 0;
    var $x1 = x1 >>> 0;
    var $y0 = y0 >>> 0;
    return $x1 - (y1 >>> 0) - ((~$x0 & $y0 | ~($x0 ^ $y0) & $x0 - $y0 >>> 0) >>> 31) | 0;
  }
});

},{"./_export":259}],508:[function(require,module,exports){
'use strict';

// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');

$export($export.S, 'Math', { RAD_PER_DEG: 180 / Math.PI });

},{"./_export":259}],509:[function(require,module,exports){
'use strict';

// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');
var DEG_PER_RAD = Math.PI / 180;

$export($export.S, 'Math', {
  radians: function radians(degrees) {
    return degrees * DEG_PER_RAD;
  }
});

},{"./_export":259}],510:[function(require,module,exports){
'use strict';

// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');

$export($export.S, 'Math', { scale: require('./_math-scale') });

},{"./_export":259,"./_math-scale":289}],511:[function(require,module,exports){
'use strict';

// http://jfbastien.github.io/papers/Math.signbit.html
var $export = require('./_export');

$export($export.S, 'Math', { signbit: function signbit(x) {
    // eslint-disable-next-line no-self-compare
    return (x = +x) != x ? x : x == 0 ? 1 / x == Infinity : x > 0;
  } });

},{"./_export":259}],512:[function(require,module,exports){
'use strict';

// https://gist.github.com/BrendanEich/4294d5c212a6d2254703
var $export = require('./_export');

$export($export.S, 'Math', {
  umulh: function umulh(u, v) {
    var UINT16 = 0xffff;
    var $u = +u;
    var $v = +v;
    var u0 = $u & UINT16;
    var v0 = $v & UINT16;
    var u1 = $u >>> 16;
    var v1 = $v >>> 16;
    var t = (u1 * v0 >>> 0) + (u0 * v0 >>> 16);
    return u1 * v1 + (t >>> 16) + ((u0 * v1 >>> 0) + (t & UINT16) >>> 16);
  }
});

},{"./_export":259}],513:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var toObject = require('./_to-object');
var aFunction = require('./_a-function');
var $defineProperty = require('./_object-dp');

// B.2.2.2 Object.prototype.__defineGetter__(P, getter)
require('./_descriptors') && $export($export.P + require('./_object-forced-pam'), 'Object', {
  __defineGetter__: function __defineGetter__(P, getter) {
    $defineProperty.f(toObject(this), P, { get: aFunction(getter), enumerable: true, configurable: true });
  }
});

},{"./_a-function":229,"./_descriptors":255,"./_export":259,"./_object-dp":297,"./_object-forced-pam":299,"./_to-object":342}],514:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var toObject = require('./_to-object');
var aFunction = require('./_a-function');
var $defineProperty = require('./_object-dp');

// B.2.2.3 Object.prototype.__defineSetter__(P, setter)
require('./_descriptors') && $export($export.P + require('./_object-forced-pam'), 'Object', {
  __defineSetter__: function __defineSetter__(P, setter) {
    $defineProperty.f(toObject(this), P, { set: aFunction(setter), enumerable: true, configurable: true });
  }
});

},{"./_a-function":229,"./_descriptors":255,"./_export":259,"./_object-dp":297,"./_object-forced-pam":299,"./_to-object":342}],515:[function(require,module,exports){
'use strict';

// https://github.com/tc39/proposal-object-values-entries
var $export = require('./_export');
var $entries = require('./_object-to-array')(true);

$export($export.S, 'Object', {
  entries: function entries(it) {
    return $entries(it);
  }
});

},{"./_export":259,"./_object-to-array":309}],516:[function(require,module,exports){
'use strict';

// https://github.com/tc39/proposal-object-getownpropertydescriptors
var $export = require('./_export');
var ownKeys = require('./_own-keys');
var toIObject = require('./_to-iobject');
var gOPD = require('./_object-gopd');
var createProperty = require('./_create-property');

$export($export.S, 'Object', {
  getOwnPropertyDescriptors: function getOwnPropertyDescriptors(object) {
    var O = toIObject(object);
    var getDesc = gOPD.f;
    var keys = ownKeys(O);
    var result = {};
    var i = 0;
    var key, desc;
    while (keys.length > i) {
      desc = getDesc(O, key = keys[i++]);
      if (desc !== undefined) createProperty(result, key, desc);
    }
    return result;
  }
});

},{"./_create-property":250,"./_export":259,"./_object-gopd":300,"./_own-keys":310,"./_to-iobject":340}],517:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var toObject = require('./_to-object');
var toPrimitive = require('./_to-primitive');
var getPrototypeOf = require('./_object-gpo');
var getOwnPropertyDescriptor = require('./_object-gopd').f;

// B.2.2.4 Object.prototype.__lookupGetter__(P)
require('./_descriptors') && $export($export.P + require('./_object-forced-pam'), 'Object', {
  __lookupGetter__: function __lookupGetter__(P) {
    var O = toObject(this);
    var K = toPrimitive(P, true);
    var D;
    do {
      if (D = getOwnPropertyDescriptor(O, K)) return D.get;
    } while (O = getPrototypeOf(O));
  }
});

},{"./_descriptors":255,"./_export":259,"./_object-forced-pam":299,"./_object-gopd":300,"./_object-gpo":304,"./_to-object":342,"./_to-primitive":343}],518:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var toObject = require('./_to-object');
var toPrimitive = require('./_to-primitive');
var getPrototypeOf = require('./_object-gpo');
var getOwnPropertyDescriptor = require('./_object-gopd').f;

// B.2.2.5 Object.prototype.__lookupSetter__(P)
require('./_descriptors') && $export($export.P + require('./_object-forced-pam'), 'Object', {
  __lookupSetter__: function __lookupSetter__(P) {
    var O = toObject(this);
    var K = toPrimitive(P, true);
    var D;
    do {
      if (D = getOwnPropertyDescriptor(O, K)) return D.set;
    } while (O = getPrototypeOf(O));
  }
});

},{"./_descriptors":255,"./_export":259,"./_object-forced-pam":299,"./_object-gopd":300,"./_object-gpo":304,"./_to-object":342,"./_to-primitive":343}],519:[function(require,module,exports){
'use strict';

// https://github.com/tc39/proposal-object-values-entries
var $export = require('./_export');
var $values = require('./_object-to-array')(false);

$export($export.S, 'Object', {
  values: function values(it) {
    return $values(it);
  }
});

},{"./_export":259,"./_object-to-array":309}],520:[function(require,module,exports){
'use strict';
// https://github.com/zenparsing/es-observable

var $export = require('./_export');
var global = require('./_global');
var core = require('./_core');
var microtask = require('./_microtask')();
var OBSERVABLE = require('./_wks')('observable');
var aFunction = require('./_a-function');
var anObject = require('./_an-object');
var anInstance = require('./_an-instance');
var redefineAll = require('./_redefine-all');
var hide = require('./_hide');
var forOf = require('./_for-of');
var RETURN = forOf.RETURN;

var getMethod = function getMethod(fn) {
  return fn == null ? undefined : aFunction(fn);
};

var cleanupSubscription = function cleanupSubscription(subscription) {
  var cleanup = subscription._c;
  if (cleanup) {
    subscription._c = undefined;
    cleanup();
  }
};

var subscriptionClosed = function subscriptionClosed(subscription) {
  return subscription._o === undefined;
};

var closeSubscription = function closeSubscription(subscription) {
  if (!subscriptionClosed(subscription)) {
    subscription._o = undefined;
    cleanupSubscription(subscription);
  }
};

var Subscription = function Subscription(observer, subscriber) {
  anObject(observer);
  this._c = undefined;
  this._o = observer;
  observer = new SubscriptionObserver(this);
  try {
    var cleanup = subscriber(observer);
    var subscription = cleanup;
    if (cleanup != null) {
      if (typeof cleanup.unsubscribe === 'function') cleanup = function cleanup() {
        subscription.unsubscribe();
      };else aFunction(cleanup);
      this._c = cleanup;
    }
  } catch (e) {
    observer.error(e);
    return;
  }if (subscriptionClosed(this)) cleanupSubscription(this);
};

Subscription.prototype = redefineAll({}, {
  unsubscribe: function unsubscribe() {
    closeSubscription(this);
  }
});

var SubscriptionObserver = function SubscriptionObserver(subscription) {
  this._s = subscription;
};

SubscriptionObserver.prototype = redefineAll({}, {
  next: function next(value) {
    var subscription = this._s;
    if (!subscriptionClosed(subscription)) {
      var observer = subscription._o;
      try {
        var m = getMethod(observer.next);
        if (m) return m.call(observer, value);
      } catch (e) {
        try {
          closeSubscription(subscription);
        } finally {
          throw e;
        }
      }
    }
  },
  error: function error(value) {
    var subscription = this._s;
    if (subscriptionClosed(subscription)) throw value;
    var observer = subscription._o;
    subscription._o = undefined;
    try {
      var m = getMethod(observer.error);
      if (!m) throw value;
      value = m.call(observer, value);
    } catch (e) {
      try {
        cleanupSubscription(subscription);
      } finally {
        throw e;
      }
    }cleanupSubscription(subscription);
    return value;
  },
  complete: function complete(value) {
    var subscription = this._s;
    if (!subscriptionClosed(subscription)) {
      var observer = subscription._o;
      subscription._o = undefined;
      try {
        var m = getMethod(observer.complete);
        value = m ? m.call(observer, value) : undefined;
      } catch (e) {
        try {
          cleanupSubscription(subscription);
        } finally {
          throw e;
        }
      }cleanupSubscription(subscription);
      return value;
    }
  }
});

var $Observable = function Observable(subscriber) {
  anInstance(this, $Observable, 'Observable', '_f')._f = aFunction(subscriber);
};

redefineAll($Observable.prototype, {
  subscribe: function subscribe(observer) {
    return new Subscription(observer, this._f);
  },
  forEach: function forEach(fn) {
    var that = this;
    return new (core.Promise || global.Promise)(function (resolve, reject) {
      aFunction(fn);
      var subscription = that.subscribe({
        next: function next(value) {
          try {
            return fn(value);
          } catch (e) {
            reject(e);
            subscription.unsubscribe();
          }
        },
        error: reject,
        complete: resolve
      });
    });
  }
});

redefineAll($Observable, {
  from: function from(x) {
    var C = typeof this === 'function' ? this : $Observable;
    var method = getMethod(anObject(x)[OBSERVABLE]);
    if (method) {
      var observable = anObject(method.call(x));
      return observable.constructor === C ? observable : new C(function (observer) {
        return observable.subscribe(observer);
      });
    }
    return new C(function (observer) {
      var done = false;
      microtask(function () {
        if (!done) {
          try {
            if (forOf(x, false, function (it) {
              observer.next(it);
              if (done) return RETURN;
            }) === RETURN) return;
          } catch (e) {
            if (done) throw e;
            observer.error(e);
            return;
          }observer.complete();
        }
      });
      return function () {
        done = true;
      };
    });
  },
  of: function of() {
    for (var i = 0, l = arguments.length, items = new Array(l); i < l;) {
      items[i] = arguments[i++];
    }return new (typeof this === 'function' ? this : $Observable)(function (observer) {
      var done = false;
      microtask(function () {
        if (!done) {
          for (var j = 0; j < items.length; ++j) {
            observer.next(items[j]);
            if (done) return;
          }observer.complete();
        }
      });
      return function () {
        done = true;
      };
    });
  }
});

hide($Observable.prototype, OBSERVABLE, function () {
  return this;
});

$export($export.G, { Observable: $Observable });

require('./_set-species')('Observable');

},{"./_a-function":229,"./_an-instance":232,"./_an-object":233,"./_core":249,"./_export":259,"./_for-of":265,"./_global":266,"./_hide":268,"./_microtask":293,"./_redefine-all":316,"./_set-species":323,"./_wks":352}],521:[function(require,module,exports){
arguments[4][224][0].apply(exports,arguments)
},{"./_core":249,"./_export":259,"./_global":266,"./_promise-resolve":314,"./_species-constructor":327,"dup":224}],522:[function(require,module,exports){
arguments[4][225][0].apply(exports,arguments)
},{"./_export":259,"./_new-promise-capability":294,"./_perform":313,"dup":225}],523:[function(require,module,exports){
'use strict';

var metadata = require('./_metadata');
var anObject = require('./_an-object');
var toMetaKey = metadata.key;
var ordinaryDefineOwnMetadata = metadata.set;

metadata.exp({ defineMetadata: function defineMetadata(metadataKey, metadataValue, target, targetKey) {
    ordinaryDefineOwnMetadata(metadataKey, metadataValue, anObject(target), toMetaKey(targetKey));
  } });

},{"./_an-object":233,"./_metadata":292}],524:[function(require,module,exports){
'use strict';

var metadata = require('./_metadata');
var anObject = require('./_an-object');
var toMetaKey = metadata.key;
var getOrCreateMetadataMap = metadata.map;
var store = metadata.store;

metadata.exp({ deleteMetadata: function deleteMetadata(metadataKey, target /* , targetKey */) {
    var targetKey = arguments.length < 3 ? undefined : toMetaKey(arguments[2]);
    var metadataMap = getOrCreateMetadataMap(anObject(target), targetKey, false);
    if (metadataMap === undefined || !metadataMap['delete'](metadataKey)) return false;
    if (metadataMap.size) return true;
    var targetMetadata = store.get(target);
    targetMetadata['delete'](targetKey);
    return !!targetMetadata.size || store['delete'](target);
  } });

},{"./_an-object":233,"./_metadata":292}],525:[function(require,module,exports){
'use strict';

var Set = require('./es6.set');
var from = require('./_array-from-iterable');
var metadata = require('./_metadata');
var anObject = require('./_an-object');
var getPrototypeOf = require('./_object-gpo');
var ordinaryOwnMetadataKeys = metadata.keys;
var toMetaKey = metadata.key;

var ordinaryMetadataKeys = function ordinaryMetadataKeys(O, P) {
  var oKeys = ordinaryOwnMetadataKeys(O, P);
  var parent = getPrototypeOf(O);
  if (parent === null) return oKeys;
  var pKeys = ordinaryMetadataKeys(parent, P);
  return pKeys.length ? oKeys.length ? from(new Set(oKeys.concat(pKeys))) : pKeys : oKeys;
};

metadata.exp({ getMetadataKeys: function getMetadataKeys(target /* , targetKey */) {
    return ordinaryMetadataKeys(anObject(target), arguments.length < 2 ? undefined : toMetaKey(arguments[1]));
  } });

},{"./_an-object":233,"./_array-from-iterable":236,"./_metadata":292,"./_object-gpo":304,"./es6.set":455}],526:[function(require,module,exports){
'use strict';

var metadata = require('./_metadata');
var anObject = require('./_an-object');
var getPrototypeOf = require('./_object-gpo');
var ordinaryHasOwnMetadata = metadata.has;
var ordinaryGetOwnMetadata = metadata.get;
var toMetaKey = metadata.key;

var ordinaryGetMetadata = function ordinaryGetMetadata(MetadataKey, O, P) {
  var hasOwn = ordinaryHasOwnMetadata(MetadataKey, O, P);
  if (hasOwn) return ordinaryGetOwnMetadata(MetadataKey, O, P);
  var parent = getPrototypeOf(O);
  return parent !== null ? ordinaryGetMetadata(MetadataKey, parent, P) : undefined;
};

metadata.exp({ getMetadata: function getMetadata(metadataKey, target /* , targetKey */) {
    return ordinaryGetMetadata(metadataKey, anObject(target), arguments.length < 3 ? undefined : toMetaKey(arguments[2]));
  } });

},{"./_an-object":233,"./_metadata":292,"./_object-gpo":304}],527:[function(require,module,exports){
'use strict';

var metadata = require('./_metadata');
var anObject = require('./_an-object');
var ordinaryOwnMetadataKeys = metadata.keys;
var toMetaKey = metadata.key;

metadata.exp({ getOwnMetadataKeys: function getOwnMetadataKeys(target /* , targetKey */) {
    return ordinaryOwnMetadataKeys(anObject(target), arguments.length < 2 ? undefined : toMetaKey(arguments[1]));
  } });

},{"./_an-object":233,"./_metadata":292}],528:[function(require,module,exports){
'use strict';

var metadata = require('./_metadata');
var anObject = require('./_an-object');
var ordinaryGetOwnMetadata = metadata.get;
var toMetaKey = metadata.key;

metadata.exp({ getOwnMetadata: function getOwnMetadata(metadataKey, target /* , targetKey */) {
    return ordinaryGetOwnMetadata(metadataKey, anObject(target), arguments.length < 3 ? undefined : toMetaKey(arguments[2]));
  } });

},{"./_an-object":233,"./_metadata":292}],529:[function(require,module,exports){
'use strict';

var metadata = require('./_metadata');
var anObject = require('./_an-object');
var getPrototypeOf = require('./_object-gpo');
var ordinaryHasOwnMetadata = metadata.has;
var toMetaKey = metadata.key;

var ordinaryHasMetadata = function ordinaryHasMetadata(MetadataKey, O, P) {
  var hasOwn = ordinaryHasOwnMetadata(MetadataKey, O, P);
  if (hasOwn) return true;
  var parent = getPrototypeOf(O);
  return parent !== null ? ordinaryHasMetadata(MetadataKey, parent, P) : false;
};

metadata.exp({ hasMetadata: function hasMetadata(metadataKey, target /* , targetKey */) {
    return ordinaryHasMetadata(metadataKey, anObject(target), arguments.length < 3 ? undefined : toMetaKey(arguments[2]));
  } });

},{"./_an-object":233,"./_metadata":292,"./_object-gpo":304}],530:[function(require,module,exports){
'use strict';

var metadata = require('./_metadata');
var anObject = require('./_an-object');
var ordinaryHasOwnMetadata = metadata.has;
var toMetaKey = metadata.key;

metadata.exp({ hasOwnMetadata: function hasOwnMetadata(metadataKey, target /* , targetKey */) {
    return ordinaryHasOwnMetadata(metadataKey, anObject(target), arguments.length < 3 ? undefined : toMetaKey(arguments[2]));
  } });

},{"./_an-object":233,"./_metadata":292}],531:[function(require,module,exports){
'use strict';

var $metadata = require('./_metadata');
var anObject = require('./_an-object');
var aFunction = require('./_a-function');
var toMetaKey = $metadata.key;
var ordinaryDefineOwnMetadata = $metadata.set;

$metadata.exp({ metadata: function metadata(metadataKey, metadataValue) {
    return function decorator(target, targetKey) {
      ordinaryDefineOwnMetadata(metadataKey, metadataValue, (targetKey !== undefined ? anObject : aFunction)(target), toMetaKey(targetKey));
    };
  } });

},{"./_a-function":229,"./_an-object":233,"./_metadata":292}],532:[function(require,module,exports){
'use strict';

// https://tc39.github.io/proposal-setmap-offrom/#sec-set.from
require('./_set-collection-from')('Set');

},{"./_set-collection-from":320}],533:[function(require,module,exports){
'use strict';

// https://tc39.github.io/proposal-setmap-offrom/#sec-set.of
require('./_set-collection-of')('Set');

},{"./_set-collection-of":321}],534:[function(require,module,exports){
'use strict';

// https://github.com/DavidBruant/Map-Set.prototype.toJSON
var $export = require('./_export');

$export($export.P + $export.R, 'Set', { toJSON: require('./_collection-to-json')('Set') });

},{"./_collection-to-json":246,"./_export":259}],535:[function(require,module,exports){
'use strict';
// https://github.com/mathiasbynens/String.prototype.at

var $export = require('./_export');
var $at = require('./_string-at')(true);

$export($export.P, 'String', {
  at: function at(pos) {
    return $at(this, pos);
  }
});

},{"./_export":259,"./_string-at":329}],536:[function(require,module,exports){
'use strict';
// https://tc39.github.io/String.prototype.matchAll/

var $export = require('./_export');
var defined = require('./_defined');
var toLength = require('./_to-length');
var isRegExp = require('./_is-regexp');
var getFlags = require('./_flags');
var RegExpProto = RegExp.prototype;

var $RegExpStringIterator = function $RegExpStringIterator(regexp, string) {
  this._r = regexp;
  this._s = string;
};

require('./_iter-create')($RegExpStringIterator, 'RegExp String', function next() {
  var match = this._r.exec(this._s);
  return { value: match, done: match === null };
});

$export($export.P, 'String', {
  matchAll: function matchAll(regexp) {
    defined(this);
    if (!isRegExp(regexp)) throw TypeError(regexp + ' is not a regexp!');
    var S = String(this);
    var flags = 'flags' in RegExpProto ? String(regexp.flags) : getFlags.call(regexp);
    var rx = new RegExp(regexp.source, ~flags.indexOf('g') ? flags : 'g' + flags);
    rx.lastIndex = toLength(regexp.lastIndex);
    return new $RegExpStringIterator(rx, S);
  }
});

},{"./_defined":254,"./_export":259,"./_flags":263,"./_is-regexp":278,"./_iter-create":280,"./_to-length":341}],537:[function(require,module,exports){
'use strict';
// https://github.com/tc39/proposal-string-pad-start-end

var $export = require('./_export');
var $pad = require('./_string-pad');
var userAgent = require('./_user-agent');

// https://github.com/zloirock/core-js/issues/280
$export($export.P + $export.F * /Version\/10\.\d+(\.\d+)? Safari\//.test(userAgent), 'String', {
  padEnd: function padEnd(maxLength /* , fillString = ' ' */) {
    return $pad(this, maxLength, arguments.length > 1 ? arguments[1] : undefined, false);
  }
});

},{"./_export":259,"./_string-pad":332,"./_user-agent":348}],538:[function(require,module,exports){
'use strict';
// https://github.com/tc39/proposal-string-pad-start-end

var $export = require('./_export');
var $pad = require('./_string-pad');
var userAgent = require('./_user-agent');

// https://github.com/zloirock/core-js/issues/280
$export($export.P + $export.F * /Version\/10\.\d+(\.\d+)? Safari\//.test(userAgent), 'String', {
  padStart: function padStart(maxLength /* , fillString = ' ' */) {
    return $pad(this, maxLength, arguments.length > 1 ? arguments[1] : undefined, true);
  }
});

},{"./_export":259,"./_string-pad":332,"./_user-agent":348}],539:[function(require,module,exports){
'use strict';
// https://github.com/sebmarkbage/ecmascript-string-left-right-trim

require('./_string-trim')('trimLeft', function ($trim) {
  return function trimLeft() {
    return $trim(this, 1);
  };
}, 'trimStart');

},{"./_string-trim":334}],540:[function(require,module,exports){
'use strict';
// https://github.com/sebmarkbage/ecmascript-string-left-right-trim

require('./_string-trim')('trimRight', function ($trim) {
  return function trimRight() {
    return $trim(this, 2);
  };
}, 'trimEnd');

},{"./_string-trim":334}],541:[function(require,module,exports){
arguments[4][226][0].apply(exports,arguments)
},{"./_wks-define":350,"dup":226}],542:[function(require,module,exports){
arguments[4][227][0].apply(exports,arguments)
},{"./_wks-define":350,"dup":227}],543:[function(require,module,exports){
'use strict';

// https://github.com/tc39/proposal-global
var $export = require('./_export');

$export($export.S, 'System', { global: require('./_global') });

},{"./_export":259,"./_global":266}],544:[function(require,module,exports){
'use strict';

// https://tc39.github.io/proposal-setmap-offrom/#sec-weakmap.from
require('./_set-collection-from')('WeakMap');

},{"./_set-collection-from":320}],545:[function(require,module,exports){
'use strict';

// https://tc39.github.io/proposal-setmap-offrom/#sec-weakmap.of
require('./_set-collection-of')('WeakMap');

},{"./_set-collection-of":321}],546:[function(require,module,exports){
'use strict';

// https://tc39.github.io/proposal-setmap-offrom/#sec-weakset.from
require('./_set-collection-from')('WeakSet');

},{"./_set-collection-from":320}],547:[function(require,module,exports){
'use strict';

// https://tc39.github.io/proposal-setmap-offrom/#sec-weakset.of
require('./_set-collection-of')('WeakSet');

},{"./_set-collection-of":321}],548:[function(require,module,exports){
'use strict';

var $iterators = require('./es6.array.iterator');
var getKeys = require('./_object-keys');
var redefine = require('./_redefine');
var global = require('./_global');
var hide = require('./_hide');
var Iterators = require('./_iterators');
var wks = require('./_wks');
var ITERATOR = wks('iterator');
var TO_STRING_TAG = wks('toStringTag');
var ArrayValues = Iterators.Array;

var DOMIterables = {
  CSSRuleList: true, // TODO: Not spec compliant, should be false.
  CSSStyleDeclaration: false,
  CSSValueList: false,
  ClientRectList: false,
  DOMRectList: false,
  DOMStringList: false,
  DOMTokenList: true,
  DataTransferItemList: false,
  FileList: false,
  HTMLAllCollection: false,
  HTMLCollection: false,
  HTMLFormElement: false,
  HTMLSelectElement: false,
  MediaList: true, // TODO: Not spec compliant, should be false.
  MimeTypeArray: false,
  NamedNodeMap: false,
  NodeList: true,
  PaintRequestList: false,
  Plugin: false,
  PluginArray: false,
  SVGLengthList: false,
  SVGNumberList: false,
  SVGPathSegList: false,
  SVGPointList: false,
  SVGStringList: false,
  SVGTransformList: false,
  SourceBufferList: false,
  StyleSheetList: true, // TODO: Not spec compliant, should be false.
  TextTrackCueList: false,
  TextTrackList: false,
  TouchList: false
};

for (var collections = getKeys(DOMIterables), i = 0; i < collections.length; i++) {
  var NAME = collections[i];
  var explicit = DOMIterables[NAME];
  var Collection = global[NAME];
  var proto = Collection && Collection.prototype;
  var key;
  if (proto) {
    if (!proto[ITERATOR]) hide(proto, ITERATOR, ArrayValues);
    if (!proto[TO_STRING_TAG]) hide(proto, TO_STRING_TAG, NAME);
    Iterators[NAME] = ArrayValues;
    if (explicit) for (key in $iterators) {
      if (!proto[key]) redefine(proto, key, $iterators[key], true);
    }
  }
}

},{"./_global":266,"./_hide":268,"./_iterators":284,"./_object-keys":306,"./_redefine":317,"./_wks":352,"./es6.array.iterator":365}],549:[function(require,module,exports){
'use strict';

var $export = require('./_export');
var $task = require('./_task');
$export($export.G + $export.B, {
  setImmediate: $task.set,
  clearImmediate: $task.clear
});

},{"./_export":259,"./_task":336}],550:[function(require,module,exports){
'use strict';

// ie9- setTimeout & setInterval additional parameters fix
var global = require('./_global');
var $export = require('./_export');
var userAgent = require('./_user-agent');
var slice = [].slice;
var MSIE = /MSIE .\./.test(userAgent); // <- dirty ie9- check
var wrap = function wrap(set) {
  return function (fn, time /* , ...args */) {
    var boundArgs = arguments.length > 2;
    var args = boundArgs ? slice.call(arguments, 2) : false;
    return set(boundArgs ? function () {
      // eslint-disable-next-line no-new-func
      (typeof fn == 'function' ? fn : Function(fn)).apply(this, args);
    } : fn, time);
  };
};
$export($export.G + $export.B + $export.F * MSIE, {
  setTimeout: wrap(global.setTimeout),
  setInterval: wrap(global.setInterval)
});

},{"./_export":259,"./_global":266,"./_user-agent":348}],551:[function(require,module,exports){
'use strict';

require('./modules/es6.symbol');
require('./modules/es6.object.create');
require('./modules/es6.object.define-property');
require('./modules/es6.object.define-properties');
require('./modules/es6.object.get-own-property-descriptor');
require('./modules/es6.object.get-prototype-of');
require('./modules/es6.object.keys');
require('./modules/es6.object.get-own-property-names');
require('./modules/es6.object.freeze');
require('./modules/es6.object.seal');
require('./modules/es6.object.prevent-extensions');
require('./modules/es6.object.is-frozen');
require('./modules/es6.object.is-sealed');
require('./modules/es6.object.is-extensible');
require('./modules/es6.object.assign');
require('./modules/es6.object.is');
require('./modules/es6.object.set-prototype-of');
require('./modules/es6.object.to-string');
require('./modules/es6.function.bind');
require('./modules/es6.function.name');
require('./modules/es6.function.has-instance');
require('./modules/es6.parse-int');
require('./modules/es6.parse-float');
require('./modules/es6.number.constructor');
require('./modules/es6.number.to-fixed');
require('./modules/es6.number.to-precision');
require('./modules/es6.number.epsilon');
require('./modules/es6.number.is-finite');
require('./modules/es6.number.is-integer');
require('./modules/es6.number.is-nan');
require('./modules/es6.number.is-safe-integer');
require('./modules/es6.number.max-safe-integer');
require('./modules/es6.number.min-safe-integer');
require('./modules/es6.number.parse-float');
require('./modules/es6.number.parse-int');
require('./modules/es6.math.acosh');
require('./modules/es6.math.asinh');
require('./modules/es6.math.atanh');
require('./modules/es6.math.cbrt');
require('./modules/es6.math.clz32');
require('./modules/es6.math.cosh');
require('./modules/es6.math.expm1');
require('./modules/es6.math.fround');
require('./modules/es6.math.hypot');
require('./modules/es6.math.imul');
require('./modules/es6.math.log10');
require('./modules/es6.math.log1p');
require('./modules/es6.math.log2');
require('./modules/es6.math.sign');
require('./modules/es6.math.sinh');
require('./modules/es6.math.tanh');
require('./modules/es6.math.trunc');
require('./modules/es6.string.from-code-point');
require('./modules/es6.string.raw');
require('./modules/es6.string.trim');
require('./modules/es6.string.iterator');
require('./modules/es6.string.code-point-at');
require('./modules/es6.string.ends-with');
require('./modules/es6.string.includes');
require('./modules/es6.string.repeat');
require('./modules/es6.string.starts-with');
require('./modules/es6.string.anchor');
require('./modules/es6.string.big');
require('./modules/es6.string.blink');
require('./modules/es6.string.bold');
require('./modules/es6.string.fixed');
require('./modules/es6.string.fontcolor');
require('./modules/es6.string.fontsize');
require('./modules/es6.string.italics');
require('./modules/es6.string.link');
require('./modules/es6.string.small');
require('./modules/es6.string.strike');
require('./modules/es6.string.sub');
require('./modules/es6.string.sup');
require('./modules/es6.date.now');
require('./modules/es6.date.to-json');
require('./modules/es6.date.to-iso-string');
require('./modules/es6.date.to-string');
require('./modules/es6.date.to-primitive');
require('./modules/es6.array.is-array');
require('./modules/es6.array.from');
require('./modules/es6.array.of');
require('./modules/es6.array.join');
require('./modules/es6.array.slice');
require('./modules/es6.array.sort');
require('./modules/es6.array.for-each');
require('./modules/es6.array.map');
require('./modules/es6.array.filter');
require('./modules/es6.array.some');
require('./modules/es6.array.every');
require('./modules/es6.array.reduce');
require('./modules/es6.array.reduce-right');
require('./modules/es6.array.index-of');
require('./modules/es6.array.last-index-of');
require('./modules/es6.array.copy-within');
require('./modules/es6.array.fill');
require('./modules/es6.array.find');
require('./modules/es6.array.find-index');
require('./modules/es6.array.species');
require('./modules/es6.array.iterator');
require('./modules/es6.regexp.constructor');
require('./modules/es6.regexp.to-string');
require('./modules/es6.regexp.flags');
require('./modules/es6.regexp.match');
require('./modules/es6.regexp.replace');
require('./modules/es6.regexp.search');
require('./modules/es6.regexp.split');
require('./modules/es6.promise');
require('./modules/es6.map');
require('./modules/es6.set');
require('./modules/es6.weak-map');
require('./modules/es6.weak-set');
require('./modules/es6.typed.array-buffer');
require('./modules/es6.typed.data-view');
require('./modules/es6.typed.int8-array');
require('./modules/es6.typed.uint8-array');
require('./modules/es6.typed.uint8-clamped-array');
require('./modules/es6.typed.int16-array');
require('./modules/es6.typed.uint16-array');
require('./modules/es6.typed.int32-array');
require('./modules/es6.typed.uint32-array');
require('./modules/es6.typed.float32-array');
require('./modules/es6.typed.float64-array');
require('./modules/es6.reflect.apply');
require('./modules/es6.reflect.construct');
require('./modules/es6.reflect.define-property');
require('./modules/es6.reflect.delete-property');
require('./modules/es6.reflect.enumerate');
require('./modules/es6.reflect.get');
require('./modules/es6.reflect.get-own-property-descriptor');
require('./modules/es6.reflect.get-prototype-of');
require('./modules/es6.reflect.has');
require('./modules/es6.reflect.is-extensible');
require('./modules/es6.reflect.own-keys');
require('./modules/es6.reflect.prevent-extensions');
require('./modules/es6.reflect.set');
require('./modules/es6.reflect.set-prototype-of');
require('./modules/es7.array.includes');
require('./modules/es7.array.flat-map');
require('./modules/es7.array.flatten');
require('./modules/es7.string.at');
require('./modules/es7.string.pad-start');
require('./modules/es7.string.pad-end');
require('./modules/es7.string.trim-left');
require('./modules/es7.string.trim-right');
require('./modules/es7.string.match-all');
require('./modules/es7.symbol.async-iterator');
require('./modules/es7.symbol.observable');
require('./modules/es7.object.get-own-property-descriptors');
require('./modules/es7.object.values');
require('./modules/es7.object.entries');
require('./modules/es7.object.define-getter');
require('./modules/es7.object.define-setter');
require('./modules/es7.object.lookup-getter');
require('./modules/es7.object.lookup-setter');
require('./modules/es7.map.to-json');
require('./modules/es7.set.to-json');
require('./modules/es7.map.of');
require('./modules/es7.set.of');
require('./modules/es7.weak-map.of');
require('./modules/es7.weak-set.of');
require('./modules/es7.map.from');
require('./modules/es7.set.from');
require('./modules/es7.weak-map.from');
require('./modules/es7.weak-set.from');
require('./modules/es7.global');
require('./modules/es7.system.global');
require('./modules/es7.error.is-error');
require('./modules/es7.math.clamp');
require('./modules/es7.math.deg-per-rad');
require('./modules/es7.math.degrees');
require('./modules/es7.math.fscale');
require('./modules/es7.math.iaddh');
require('./modules/es7.math.isubh');
require('./modules/es7.math.imulh');
require('./modules/es7.math.rad-per-deg');
require('./modules/es7.math.radians');
require('./modules/es7.math.scale');
require('./modules/es7.math.umulh');
require('./modules/es7.math.signbit');
require('./modules/es7.promise.finally');
require('./modules/es7.promise.try');
require('./modules/es7.reflect.define-metadata');
require('./modules/es7.reflect.delete-metadata');
require('./modules/es7.reflect.get-metadata');
require('./modules/es7.reflect.get-metadata-keys');
require('./modules/es7.reflect.get-own-metadata');
require('./modules/es7.reflect.get-own-metadata-keys');
require('./modules/es7.reflect.has-metadata');
require('./modules/es7.reflect.has-own-metadata');
require('./modules/es7.reflect.metadata');
require('./modules/es7.asap');
require('./modules/es7.observable');
require('./modules/web.timers');
require('./modules/web.immediate');
require('./modules/web.dom.iterable');
module.exports = require('./modules/_core');

},{"./modules/_core":249,"./modules/es6.array.copy-within":355,"./modules/es6.array.every":356,"./modules/es6.array.fill":357,"./modules/es6.array.filter":358,"./modules/es6.array.find":360,"./modules/es6.array.find-index":359,"./modules/es6.array.for-each":361,"./modules/es6.array.from":362,"./modules/es6.array.index-of":363,"./modules/es6.array.is-array":364,"./modules/es6.array.iterator":365,"./modules/es6.array.join":366,"./modules/es6.array.last-index-of":367,"./modules/es6.array.map":368,"./modules/es6.array.of":369,"./modules/es6.array.reduce":371,"./modules/es6.array.reduce-right":370,"./modules/es6.array.slice":372,"./modules/es6.array.some":373,"./modules/es6.array.sort":374,"./modules/es6.array.species":375,"./modules/es6.date.now":376,"./modules/es6.date.to-iso-string":377,"./modules/es6.date.to-json":378,"./modules/es6.date.to-primitive":379,"./modules/es6.date.to-string":380,"./modules/es6.function.bind":381,"./modules/es6.function.has-instance":382,"./modules/es6.function.name":383,"./modules/es6.map":384,"./modules/es6.math.acosh":385,"./modules/es6.math.asinh":386,"./modules/es6.math.atanh":387,"./modules/es6.math.cbrt":388,"./modules/es6.math.clz32":389,"./modules/es6.math.cosh":390,"./modules/es6.math.expm1":391,"./modules/es6.math.fround":392,"./modules/es6.math.hypot":393,"./modules/es6.math.imul":394,"./modules/es6.math.log10":395,"./modules/es6.math.log1p":396,"./modules/es6.math.log2":397,"./modules/es6.math.sign":398,"./modules/es6.math.sinh":399,"./modules/es6.math.tanh":400,"./modules/es6.math.trunc":401,"./modules/es6.number.constructor":402,"./modules/es6.number.epsilon":403,"./modules/es6.number.is-finite":404,"./modules/es6.number.is-integer":405,"./modules/es6.number.is-nan":406,"./modules/es6.number.is-safe-integer":407,"./modules/es6.number.max-safe-integer":408,"./modules/es6.number.min-safe-integer":409,"./modules/es6.number.parse-float":410,"./modules/es6.number.parse-int":411,"./modules/es6.number.to-fixed":412,"./modules/es6.number.to-precision":413,"./modules/es6.object.assign":414,"./modules/es6.object.create":415,"./modules/es6.object.define-properties":416,"./modules/es6.object.define-property":417,"./modules/es6.object.freeze":418,"./modules/es6.object.get-own-property-descriptor":419,"./modules/es6.object.get-own-property-names":420,"./modules/es6.object.get-prototype-of":421,"./modules/es6.object.is":425,"./modules/es6.object.is-extensible":422,"./modules/es6.object.is-frozen":423,"./modules/es6.object.is-sealed":424,"./modules/es6.object.keys":426,"./modules/es6.object.prevent-extensions":427,"./modules/es6.object.seal":428,"./modules/es6.object.set-prototype-of":429,"./modules/es6.object.to-string":430,"./modules/es6.parse-float":431,"./modules/es6.parse-int":432,"./modules/es6.promise":433,"./modules/es6.reflect.apply":434,"./modules/es6.reflect.construct":435,"./modules/es6.reflect.define-property":436,"./modules/es6.reflect.delete-property":437,"./modules/es6.reflect.enumerate":438,"./modules/es6.reflect.get":441,"./modules/es6.reflect.get-own-property-descriptor":439,"./modules/es6.reflect.get-prototype-of":440,"./modules/es6.reflect.has":442,"./modules/es6.reflect.is-extensible":443,"./modules/es6.reflect.own-keys":444,"./modules/es6.reflect.prevent-extensions":445,"./modules/es6.reflect.set":447,"./modules/es6.reflect.set-prototype-of":446,"./modules/es6.regexp.constructor":448,"./modules/es6.regexp.flags":449,"./modules/es6.regexp.match":450,"./modules/es6.regexp.replace":451,"./modules/es6.regexp.search":452,"./modules/es6.regexp.split":453,"./modules/es6.regexp.to-string":454,"./modules/es6.set":455,"./modules/es6.string.anchor":456,"./modules/es6.string.big":457,"./modules/es6.string.blink":458,"./modules/es6.string.bold":459,"./modules/es6.string.code-point-at":460,"./modules/es6.string.ends-with":461,"./modules/es6.string.fixed":462,"./modules/es6.string.fontcolor":463,"./modules/es6.string.fontsize":464,"./modules/es6.string.from-code-point":465,"./modules/es6.string.includes":466,"./modules/es6.string.italics":467,"./modules/es6.string.iterator":468,"./modules/es6.string.link":469,"./modules/es6.string.raw":470,"./modules/es6.string.repeat":471,"./modules/es6.string.small":472,"./modules/es6.string.starts-with":473,"./modules/es6.string.strike":474,"./modules/es6.string.sub":475,"./modules/es6.string.sup":476,"./modules/es6.string.trim":477,"./modules/es6.symbol":478,"./modules/es6.typed.array-buffer":479,"./modules/es6.typed.data-view":480,"./modules/es6.typed.float32-array":481,"./modules/es6.typed.float64-array":482,"./modules/es6.typed.int16-array":483,"./modules/es6.typed.int32-array":484,"./modules/es6.typed.int8-array":485,"./modules/es6.typed.uint16-array":486,"./modules/es6.typed.uint32-array":487,"./modules/es6.typed.uint8-array":488,"./modules/es6.typed.uint8-clamped-array":489,"./modules/es6.weak-map":490,"./modules/es6.weak-set":491,"./modules/es7.array.flat-map":492,"./modules/es7.array.flatten":493,"./modules/es7.array.includes":494,"./modules/es7.asap":495,"./modules/es7.error.is-error":496,"./modules/es7.global":497,"./modules/es7.map.from":498,"./modules/es7.map.of":499,"./modules/es7.map.to-json":500,"./modules/es7.math.clamp":501,"./modules/es7.math.deg-per-rad":502,"./modules/es7.math.degrees":503,"./modules/es7.math.fscale":504,"./modules/es7.math.iaddh":505,"./modules/es7.math.imulh":506,"./modules/es7.math.isubh":507,"./modules/es7.math.rad-per-deg":508,"./modules/es7.math.radians":509,"./modules/es7.math.scale":510,"./modules/es7.math.signbit":511,"./modules/es7.math.umulh":512,"./modules/es7.object.define-getter":513,"./modules/es7.object.define-setter":514,"./modules/es7.object.entries":515,"./modules/es7.object.get-own-property-descriptors":516,"./modules/es7.object.lookup-getter":517,"./modules/es7.object.lookup-setter":518,"./modules/es7.object.values":519,"./modules/es7.observable":520,"./modules/es7.promise.finally":521,"./modules/es7.promise.try":522,"./modules/es7.reflect.define-metadata":523,"./modules/es7.reflect.delete-metadata":524,"./modules/es7.reflect.get-metadata":526,"./modules/es7.reflect.get-metadata-keys":525,"./modules/es7.reflect.get-own-metadata":528,"./modules/es7.reflect.get-own-metadata-keys":527,"./modules/es7.reflect.has-metadata":529,"./modules/es7.reflect.has-own-metadata":530,"./modules/es7.reflect.metadata":531,"./modules/es7.set.from":532,"./modules/es7.set.of":533,"./modules/es7.set.to-json":534,"./modules/es7.string.at":535,"./modules/es7.string.match-all":536,"./modules/es7.string.pad-end":537,"./modules/es7.string.pad-start":538,"./modules/es7.string.trim-left":539,"./modules/es7.string.trim-right":540,"./modules/es7.symbol.async-iterator":541,"./modules/es7.symbol.observable":542,"./modules/es7.system.global":543,"./modules/es7.weak-map.from":544,"./modules/es7.weak-map.of":545,"./modules/es7.weak-set.from":546,"./modules/es7.weak-set.of":547,"./modules/web.dom.iterable":548,"./modules/web.immediate":549,"./modules/web.timers":550}],552:[function(require,module,exports){
(function (Buffer){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.

function isArray(arg) {
  if (Array.isArray) {
    return Array.isArray(arg);
  }
  return objectToString(arg) === '[object Array]';
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return (typeof arg === 'undefined' ? 'undefined' : _typeof(arg)) === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return (typeof arg === 'undefined' ? 'undefined' : _typeof(arg)) === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return objectToString(e) === '[object Error]' || e instanceof Error;
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null || typeof arg === 'boolean' || typeof arg === 'number' || typeof arg === 'string' || (typeof arg === 'undefined' ? 'undefined' : _typeof(arg)) === 'symbol' || // ES6 symbol
  typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = Buffer.isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

}).call(this,{"isBuffer":require("../../is-buffer/index.js")})
},{"../../is-buffer/index.js":566}],553:[function(require,module,exports){
'use strict';

var inherits = require('inherits');
var MD5 = require('md5.js');
var RIPEMD160 = require('ripemd160');
var sha = require('sha.js');
var Base = require('cipher-base');

function Hash(hash) {
  Base.call(this, 'digest');

  this._hash = hash;
}

inherits(Hash, Base);

Hash.prototype._update = function (data) {
  this._hash.update(data);
};

Hash.prototype._final = function () {
  return this._hash.digest();
};

module.exports = function createHash(alg) {
  alg = alg.toLowerCase();
  if (alg === 'md5') return new MD5();
  if (alg === 'rmd160' || alg === 'ripemd160') return new RIPEMD160();

  return new Hash(sha(alg));
};

},{"cipher-base":122,"inherits":565,"md5.js":569,"ripemd160":590,"sha.js":593}],554:[function(require,module,exports){
'use strict';

var MD5 = require('md5.js');

module.exports = function (buffer) {
  return new MD5().update(buffer).digest();
};

},{"md5.js":569}],555:[function(require,module,exports){
'use strict';

var inherits = require('inherits');
var Legacy = require('./legacy');
var Base = require('cipher-base');
var Buffer = require('safe-buffer').Buffer;
var md5 = require('create-hash/md5');
var RIPEMD160 = require('ripemd160');

var sha = require('sha.js');

var ZEROS = Buffer.alloc(128);

function Hmac(alg, key) {
  Base.call(this, 'digest');
  if (typeof key === 'string') {
    key = Buffer.from(key);
  }

  var blocksize = alg === 'sha512' || alg === 'sha384' ? 128 : 64;

  this._alg = alg;
  this._key = key;
  if (key.length > blocksize) {
    var hash = alg === 'rmd160' ? new RIPEMD160() : sha(alg);
    key = hash.update(key).digest();
  } else if (key.length < blocksize) {
    key = Buffer.concat([key, ZEROS], blocksize);
  }

  var ipad = this._ipad = Buffer.allocUnsafe(blocksize);
  var opad = this._opad = Buffer.allocUnsafe(blocksize);

  for (var i = 0; i < blocksize; i++) {
    ipad[i] = key[i] ^ 0x36;
    opad[i] = key[i] ^ 0x5C;
  }
  this._hash = alg === 'rmd160' ? new RIPEMD160() : sha(alg);
  this._hash.update(ipad);
}

inherits(Hmac, Base);

Hmac.prototype._update = function (data) {
  this._hash.update(data);
};

Hmac.prototype._final = function () {
  var h = this._hash.digest();
  var hash = this._alg === 'rmd160' ? new RIPEMD160() : sha(this._alg);
  return hash.update(this._opad).update(h).digest();
};

module.exports = function createHmac(alg, key) {
  alg = alg.toLowerCase();
  if (alg === 'rmd160' || alg === 'ripemd160') {
    return new Hmac('rmd160', key);
  }
  if (alg === 'md5') {
    return new Legacy(md5, key);
  }
  return new Hmac(alg, key);
};

},{"./legacy":556,"cipher-base":122,"create-hash/md5":554,"inherits":565,"ripemd160":590,"safe-buffer":591,"sha.js":593}],556:[function(require,module,exports){
'use strict';

var inherits = require('inherits');
var Buffer = require('safe-buffer').Buffer;

var Base = require('cipher-base');

var ZEROS = Buffer.alloc(128);
var blocksize = 64;

function Hmac(alg, key) {
  Base.call(this, 'digest');
  if (typeof key === 'string') {
    key = Buffer.from(key);
  }

  this._alg = alg;
  this._key = key;

  if (key.length > blocksize) {
    key = alg(key);
  } else if (key.length < blocksize) {
    key = Buffer.concat([key, ZEROS], blocksize);
  }

  var ipad = this._ipad = Buffer.allocUnsafe(blocksize);
  var opad = this._opad = Buffer.allocUnsafe(blocksize);

  for (var i = 0; i < blocksize; i++) {
    ipad[i] = key[i] ^ 0x36;
    opad[i] = key[i] ^ 0x5C;
  }

  this._hash = [ipad];
}

inherits(Hmac, Base);

Hmac.prototype._update = function (data) {
  this._hash.push(data);
};

Hmac.prototype._final = function () {
  var h = this._alg(Buffer.concat(this._hash));
  return this._alg(Buffer.concat([this._opad, h]));
};
module.exports = Hmac;

},{"cipher-base":122,"inherits":565,"safe-buffer":591}],557:[function(require,module,exports){
'use strict';

var assert = require('assert');
var BigInteger = require('bigi');

var Point = require('./point');

function Curve(p, a, b, Gx, Gy, n, h) {
  this.p = p;
  this.a = a;
  this.b = b;
  this.G = Point.fromAffine(this, Gx, Gy);
  this.n = n;
  this.h = h;

  this.infinity = new Point(this, null, null, BigInteger.ZERO);

  // result caching
  this.pOverFour = p.add(BigInteger.ONE).shiftRight(2);

  // determine size of p in bytes
  this.pLength = Math.floor((this.p.bitLength() + 7) / 8);
}

Curve.prototype.pointFromX = function (isOdd, x) {
  var alpha = x.pow(3).add(this.a.multiply(x)).add(this.b).mod(this.p);
  var beta = alpha.modPow(this.pOverFour, this.p); // XXX: not compatible with all curves

  var y = beta;
  if (beta.isEven() ^ !isOdd) {
    y = this.p.subtract(y); // -y % p
  }

  return Point.fromAffine(this, x, y);
};

Curve.prototype.isInfinity = function (Q) {
  if (Q === this.infinity) return true;

  return Q.z.signum() === 0 && Q.y.signum() !== 0;
};

Curve.prototype.isOnCurve = function (Q) {
  if (this.isInfinity(Q)) return true;

  var x = Q.affineX;
  var y = Q.affineY;
  var a = this.a;
  var b = this.b;
  var p = this.p;

  // Check that xQ and yQ are integers in the interval [0, p - 1]
  if (x.signum() < 0 || x.compareTo(p) >= 0) return false;
  if (y.signum() < 0 || y.compareTo(p) >= 0) return false;

  // and check that y^2 = x^3 + ax + b (mod p)
  var lhs = y.square().mod(p);
  var rhs = x.pow(3).add(a.multiply(x)).add(b).mod(p);
  return lhs.equals(rhs);
};

/**
 * Validate an elliptic curve point.
 *
 * See SEC 1, section 3.2.2.1: Elliptic Curve Public Key Validation Primitive
 */
Curve.prototype.validate = function (Q) {
  // Check Q != O
  assert(!this.isInfinity(Q), 'Point is at infinity');
  assert(this.isOnCurve(Q), 'Point is not on the curve');

  // Check nQ = O (where Q is a scalar multiple of G)
  var nQ = Q.multiply(this.n);
  assert(this.isInfinity(nQ), 'Point is not a scalar multiple of G');

  return true;
};

module.exports = Curve;

},{"./point":561,"assert":7,"bigi":38}],558:[function(require,module,exports){
module.exports={
  "secp128r1": {
    "p": "fffffffdffffffffffffffffffffffff",
    "a": "fffffffdfffffffffffffffffffffffc",
    "b": "e87579c11079f43dd824993c2cee5ed3",
    "n": "fffffffe0000000075a30d1b9038a115",
    "h": "01",
    "Gx": "161ff7528b899b2d0c28607ca52c5b86",
    "Gy": "cf5ac8395bafeb13c02da292dded7a83"
  },
  "secp160k1": {
    "p": "fffffffffffffffffffffffffffffffeffffac73",
    "a": "00",
    "b": "07",
    "n": "0100000000000000000001b8fa16dfab9aca16b6b3",
    "h": "01",
    "Gx": "3b4c382ce37aa192a4019e763036f4f5dd4d7ebb",
    "Gy": "938cf935318fdced6bc28286531733c3f03c4fee"
  },
  "secp160r1": {
    "p": "ffffffffffffffffffffffffffffffff7fffffff",
    "a": "ffffffffffffffffffffffffffffffff7ffffffc",
    "b": "1c97befc54bd7a8b65acf89f81d4d4adc565fa45",
    "n": "0100000000000000000001f4c8f927aed3ca752257",
    "h": "01",
    "Gx": "4a96b5688ef573284664698968c38bb913cbfc82",
    "Gy": "23a628553168947d59dcc912042351377ac5fb32"
  },
  "secp192k1": {
    "p": "fffffffffffffffffffffffffffffffffffffffeffffee37",
    "a": "00",
    "b": "03",
    "n": "fffffffffffffffffffffffe26f2fc170f69466a74defd8d",
    "h": "01",
    "Gx": "db4ff10ec057e9ae26b07d0280b7f4341da5d1b1eae06c7d",
    "Gy": "9b2f2f6d9c5628a7844163d015be86344082aa88d95e2f9d"
  },
  "secp192r1": {
    "p": "fffffffffffffffffffffffffffffffeffffffffffffffff",
    "a": "fffffffffffffffffffffffffffffffefffffffffffffffc",
    "b": "64210519e59c80e70fa7e9ab72243049feb8deecc146b9b1",
    "n": "ffffffffffffffffffffffff99def836146bc9b1b4d22831",
    "h": "01",
    "Gx": "188da80eb03090f67cbf20eb43a18800f4ff0afd82ff1012",
    "Gy": "07192b95ffc8da78631011ed6b24cdd573f977a11e794811"
  },
  "secp256k1": {
    "p": "fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f",
    "a": "00",
    "b": "07",
    "n": "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
    "h": "01",
    "Gx": "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    "Gy": "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8"
  },
  "secp256r1": {
    "p": "ffffffff00000001000000000000000000000000ffffffffffffffffffffffff",
    "a": "ffffffff00000001000000000000000000000000fffffffffffffffffffffffc",
    "b": "5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b",
    "n": "ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
    "h": "01",
    "Gx": "6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296",
    "Gy": "4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"
  }
}

},{}],559:[function(require,module,exports){
'use strict';

var Point = require('./point');
var Curve = require('./curve');

var getCurveByName = require('./names');

module.exports = {
  Curve: Curve,
  Point: Point,
  getCurveByName: getCurveByName
};

},{"./curve":557,"./names":560,"./point":561}],560:[function(require,module,exports){
'use strict';

var BigInteger = require('bigi');

var curves = require('./curves.json');
var Curve = require('./curve');

function getCurveByName(name) {
  var curve = curves[name];
  if (!curve) return null;

  var p = new BigInteger(curve.p, 16);
  var a = new BigInteger(curve.a, 16);
  var b = new BigInteger(curve.b, 16);
  var n = new BigInteger(curve.n, 16);
  var h = new BigInteger(curve.h, 16);
  var Gx = new BigInteger(curve.Gx, 16);
  var Gy = new BigInteger(curve.Gy, 16);

  return new Curve(p, a, b, Gx, Gy, n, h);
}

module.exports = getCurveByName;

},{"./curve":557,"./curves.json":558,"bigi":38}],561:[function(require,module,exports){
'use strict';

var assert = require('assert');
var Buffer = require('safe-buffer').Buffer;
var BigInteger = require('bigi');

var THREE = BigInteger.valueOf(3);

function Point(curve, x, y, z) {
  assert.notStrictEqual(z, undefined, 'Missing Z coordinate');

  this.curve = curve;
  this.x = x;
  this.y = y;
  this.z = z;
  this._zInv = null;

  this.compressed = true;
}

Object.defineProperty(Point.prototype, 'zInv', {
  get: function get() {
    if (this._zInv === null) {
      this._zInv = this.z.modInverse(this.curve.p);
    }

    return this._zInv;
  }
});

Object.defineProperty(Point.prototype, 'affineX', {
  get: function get() {
    return this.x.multiply(this.zInv).mod(this.curve.p);
  }
});

Object.defineProperty(Point.prototype, 'affineY', {
  get: function get() {
    return this.y.multiply(this.zInv).mod(this.curve.p);
  }
});

Point.fromAffine = function (curve, x, y) {
  return new Point(curve, x, y, BigInteger.ONE);
};

Point.prototype.equals = function (other) {
  if (other === this) return true;
  if (this.curve.isInfinity(this)) return this.curve.isInfinity(other);
  if (this.curve.isInfinity(other)) return this.curve.isInfinity(this);

  // u = Y2 * Z1 - Y1 * Z2
  var u = other.y.multiply(this.z).subtract(this.y.multiply(other.z)).mod(this.curve.p);

  if (u.signum() !== 0) return false;

  // v = X2 * Z1 - X1 * Z2
  var v = other.x.multiply(this.z).subtract(this.x.multiply(other.z)).mod(this.curve.p);

  return v.signum() === 0;
};

Point.prototype.negate = function () {
  var y = this.curve.p.subtract(this.y);

  return new Point(this.curve, this.x, y, this.z);
};

Point.prototype.add = function (b) {
  if (this.curve.isInfinity(this)) return b;
  if (this.curve.isInfinity(b)) return this;

  var x1 = this.x;
  var y1 = this.y;
  var x2 = b.x;
  var y2 = b.y;

  // u = Y2 * Z1 - Y1 * Z2
  var u = y2.multiply(this.z).subtract(y1.multiply(b.z)).mod(this.curve.p);
  // v = X2 * Z1 - X1 * Z2
  var v = x2.multiply(this.z).subtract(x1.multiply(b.z)).mod(this.curve.p);

  if (v.signum() === 0) {
    if (u.signum() === 0) {
      return this.twice(); // this == b, so double
    }

    return this.curve.infinity; // this = -b, so infinity
  }

  var v2 = v.square();
  var v3 = v2.multiply(v);
  var x1v2 = x1.multiply(v2);
  var zu2 = u.square().multiply(this.z);

  // x3 = v * (z2 * (z1 * u^2 - 2 * x1 * v^2) - v^3)
  var x3 = zu2.subtract(x1v2.shiftLeft(1)).multiply(b.z).subtract(v3).multiply(v).mod(this.curve.p);
  // y3 = z2 * (3 * x1 * u * v^2 - y1 * v^3 - z1 * u^3) + u * v^3
  var y3 = x1v2.multiply(THREE).multiply(u).subtract(y1.multiply(v3)).subtract(zu2.multiply(u)).multiply(b.z).add(u.multiply(v3)).mod(this.curve.p);
  // z3 = v^3 * z1 * z2
  var z3 = v3.multiply(this.z).multiply(b.z).mod(this.curve.p);

  return new Point(this.curve, x3, y3, z3);
};

Point.prototype.twice = function () {
  if (this.curve.isInfinity(this)) return this;
  if (this.y.signum() === 0) return this.curve.infinity;

  var x1 = this.x;
  var y1 = this.y;

  var y1z1 = y1.multiply(this.z).mod(this.curve.p);
  var y1sqz1 = y1z1.multiply(y1).mod(this.curve.p);
  var a = this.curve.a;

  // w = 3 * x1^2 + a * z1^2
  var w = x1.square().multiply(THREE);

  if (a.signum() !== 0) {
    w = w.add(this.z.square().multiply(a));
  }

  w = w.mod(this.curve.p);
  // x3 = 2 * y1 * z1 * (w^2 - 8 * x1 * y1^2 * z1)
  var x3 = w.square().subtract(x1.shiftLeft(3).multiply(y1sqz1)).shiftLeft(1).multiply(y1z1).mod(this.curve.p);
  // y3 = 4 * y1^2 * z1 * (3 * w * x1 - 2 * y1^2 * z1) - w^3
  var y3 = w.multiply(THREE).multiply(x1).subtract(y1sqz1.shiftLeft(1)).shiftLeft(2).multiply(y1sqz1).subtract(w.pow(3)).mod(this.curve.p);
  // z3 = 8 * (y1 * z1)^3
  var z3 = y1z1.pow(3).shiftLeft(3).mod(this.curve.p);

  return new Point(this.curve, x3, y3, z3);
};

// Simple NAF (Non-Adjacent Form) multiplication algorithm
// TODO: modularize the multiplication algorithm
Point.prototype.multiply = function (k) {
  if (this.curve.isInfinity(this)) return this;
  if (k.signum() === 0) return this.curve.infinity;

  var e = k;
  var h = e.multiply(THREE);

  var neg = this.negate();
  var R = this;

  for (var i = h.bitLength() - 2; i > 0; --i) {
    var hBit = h.testBit(i);
    var eBit = e.testBit(i);

    R = R.twice();

    if (hBit !== eBit) {
      R = R.add(hBit ? this : neg);
    }
  }

  return R;
};

// Compute this*j + x*k (simultaneous multiplication)
Point.prototype.multiplyTwo = function (j, x, k) {
  var i = Math.max(j.bitLength(), k.bitLength()) - 1;
  var R = this.curve.infinity;
  var both = this.add(x);

  while (i >= 0) {
    var jBit = j.testBit(i);
    var kBit = k.testBit(i);

    R = R.twice();

    if (jBit) {
      if (kBit) {
        R = R.add(both);
      } else {
        R = R.add(this);
      }
    } else if (kBit) {
      R = R.add(x);
    }
    --i;
  }

  return R;
};

Point.prototype.getEncoded = function (compressed) {
  if (compressed == null) compressed = this.compressed;
  if (this.curve.isInfinity(this)) return Buffer.alloc(1, 0); // Infinity point encoded is simply '00'

  var x = this.affineX;
  var y = this.affineY;
  var byteLength = this.curve.pLength;
  var buffer;

  // 0x02/0x03 | X
  if (compressed) {
    buffer = Buffer.allocUnsafe(1 + byteLength);
    buffer.writeUInt8(y.isEven() ? 0x02 : 0x03, 0);

    // 0x04 | X | Y
  } else {
    buffer = Buffer.allocUnsafe(1 + byteLength + byteLength);
    buffer.writeUInt8(0x04, 0);

    y.toBuffer(byteLength).copy(buffer, 1 + byteLength);
  }

  x.toBuffer(byteLength).copy(buffer, 1);

  return buffer;
};

Point.decodeFrom = function (curve, buffer) {
  var type = buffer.readUInt8(0);
  var compressed = type !== 4;

  var byteLength = Math.floor((curve.p.bitLength() + 7) / 8);
  var x = BigInteger.fromBuffer(buffer.slice(1, 1 + byteLength));

  var Q;
  if (compressed) {
    assert.equal(buffer.length, byteLength + 1, 'Invalid sequence length');
    assert(type === 0x02 || type === 0x03, 'Invalid sequence tag');

    var isOdd = type === 0x03;
    Q = curve.pointFromX(isOdd, x);
  } else {
    assert.equal(buffer.length, 1 + byteLength + byteLength, 'Invalid sequence length');

    var y = BigInteger.fromBuffer(buffer.slice(1 + byteLength));
    Q = Point.fromAffine(curve, x, y);
  }

  Q.compressed = compressed;
  return Q;
};

Point.prototype.toString = function () {
  if (this.curve.isInfinity(this)) return '(INFINITY)';

  return '(' + this.affineX.toString() + ',' + this.affineY.toString() + ')';
};

module.exports = Point;

},{"assert":7,"bigi":38,"safe-buffer":591}],562:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var objectCreate = Object.create || objectCreatePolyfill;
var objectKeys = Object.keys || objectKeysPolyfill;
var bind = Function.prototype.bind || functionBindPolyfill;

function EventEmitter() {
  if (!this._events || !Object.prototype.hasOwnProperty.call(this, '_events')) {
    this._events = objectCreate(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

var hasDefineProperty;
try {
  var o = {};
  if (Object.defineProperty) Object.defineProperty(o, 'x', { value: 0 });
  hasDefineProperty = o.x === 0;
} catch (err) {
  hasDefineProperty = false;
}
if (hasDefineProperty) {
  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function get() {
      return defaultMaxListeners;
    },
    set: function set(arg) {
      // check whether the input is a positive number (whose value is zero or
      // greater and not a NaN).
      if (typeof arg !== 'number' || arg < 0 || arg !== arg) throw new TypeError('"defaultMaxListeners" must be a positive number');
      defaultMaxListeners = arg;
    }
  });
} else {
  EventEmitter.defaultMaxListeners = defaultMaxListeners;
}

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n)) throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined) return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn) handler.call(self);else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i) {
      listeners[i].call(self);
    }
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn) handler.call(self, arg1);else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i) {
      listeners[i].call(self, arg1);
    }
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn) handler.call(self, arg1, arg2);else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i) {
      listeners[i].call(self, arg1, arg2);
    }
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn) handler.call(self, arg1, arg2, arg3);else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i) {
      listeners[i].call(self, arg1, arg2, arg3);
    }
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn) handler.apply(self, args);else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i) {
      listeners[i].apply(self, args);
    }
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events;
  var doError = type === 'error';

  events = this._events;
  if (events) doError = doError && events.error == null;else if (!doError) return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    if (arguments.length > 1) er = arguments[1];
    if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Unhandled "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler) return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
    // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
    // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++) {
        args[i - 1] = arguments[i];
      }emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function') throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = objectCreate(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type, listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] = prepend ? [listener, existing] : [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' + existing.length + ' "' + String(type) + '" listeners ' + 'added. Use emitter.setMaxListeners() to ' + 'increase limit.');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        if ((typeof console === 'undefined' ? 'undefined' : _typeof(console)) === 'object' && console.warn) {
          console.warn('%s: %s', w.name, w.message);
        }
      }
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener = function prependListener(type, listener) {
  return _addListener(this, type, listener, true);
};

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    switch (arguments.length) {
      case 0:
        return this.listener.call(this.target);
      case 1:
        return this.listener.call(this.target, arguments[0]);
      case 2:
        return this.listener.call(this.target, arguments[0], arguments[1]);
      case 3:
        return this.listener.call(this.target, arguments[0], arguments[1], arguments[2]);
      default:
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i) {
          args[i] = arguments[i];
        }this.listener.apply(this.target, args);
    }
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = bind.call(onceWrapper, state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function') throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener = function prependOnceListener(type, listener) {
  if (typeof listener !== 'function') throw new TypeError('"listener" argument must be a function');
  this.prependListener(type, _onceWrap(this, type, listener));
  return this;
};

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener = function removeListener(type, listener) {
  var list, events, position, i, originalListener;

  if (typeof listener !== 'function') throw new TypeError('"listener" argument must be a function');

  events = this._events;
  if (!events) return this;

  list = events[type];
  if (!list) return this;

  if (list === listener || list.listener === listener) {
    if (--this._eventsCount === 0) this._events = objectCreate(null);else {
      delete events[type];
      if (events.removeListener) this.emit('removeListener', type, list.listener || listener);
    }
  } else if (typeof list !== 'function') {
    position = -1;

    for (i = list.length - 1; i >= 0; i--) {
      if (list[i] === listener || list[i].listener === listener) {
        originalListener = list[i].listener;
        position = i;
        break;
      }
    }

    if (position < 0) return this;

    if (position === 0) list.shift();else spliceOne(list, position);

    if (list.length === 1) events[type] = list[0];

    if (events.removeListener) this.emit('removeListener', type, originalListener || listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function removeAllListeners(type) {
  var listeners, events, i;

  events = this._events;
  if (!events) return this;

  // not listening for removeListener, no need to emit
  if (!events.removeListener) {
    if (arguments.length === 0) {
      this._events = objectCreate(null);
      this._eventsCount = 0;
    } else if (events[type]) {
      if (--this._eventsCount === 0) this._events = objectCreate(null);else delete events[type];
    }
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    var keys = objectKeys(events);
    var key;
    for (i = 0; i < keys.length; ++i) {
      key = keys[i];
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = objectCreate(null);
    this._eventsCount = 0;
    return this;
  }

  listeners = events[type];

  if (typeof listeners === 'function') {
    this.removeListener(type, listeners);
  } else if (listeners) {
    // LIFO order
    for (i = listeners.length - 1; i >= 0; i--) {
      this.removeListener(type, listeners[i]);
    }
  }

  return this;
};

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (!events) return [];

  var evlistener = events[type];
  if (!evlistener) return [];

  if (typeof evlistener === 'function') return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function (emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1) {
    list[i] = list[k];
  }list.pop();
}

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i) {
    copy[i] = arr[i];
  }return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function objectCreatePolyfill(proto) {
  var F = function F() {};
  F.prototype = proto;
  return new F();
}
function objectKeysPolyfill(obj) {
  var keys = [];
  for (var k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      keys.push(k);
    }
  }return k;
}
function functionBindPolyfill(context) {
  var fn = this;
  return function () {
    return fn.apply(context, arguments);
  };
}

},{}],563:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;
var Transform = require('stream').Transform;
var inherits = require('inherits');

function throwIfNotStringOrBuffer(val, prefix) {
  if (!Buffer.isBuffer(val) && typeof val !== 'string') {
    throw new TypeError(prefix + ' must be a string or a buffer');
  }
}

function HashBase(blockSize) {
  Transform.call(this);

  this._block = Buffer.allocUnsafe(blockSize);
  this._blockSize = blockSize;
  this._blockOffset = 0;
  this._length = [0, 0, 0, 0];

  this._finalized = false;
}

inherits(HashBase, Transform);

HashBase.prototype._transform = function (chunk, encoding, callback) {
  var error = null;
  try {
    this.update(chunk, encoding);
  } catch (err) {
    error = err;
  }

  callback(error);
};

HashBase.prototype._flush = function (callback) {
  var error = null;
  try {
    this.push(this.digest());
  } catch (err) {
    error = err;
  }

  callback(error);
};

HashBase.prototype.update = function (data, encoding) {
  throwIfNotStringOrBuffer(data, 'Data');
  if (this._finalized) throw new Error('Digest already called');
  if (!Buffer.isBuffer(data)) data = Buffer.from(data, encoding);

  // consume data
  var block = this._block;
  var offset = 0;
  while (this._blockOffset + data.length - offset >= this._blockSize) {
    for (var i = this._blockOffset; i < this._blockSize;) {
      block[i++] = data[offset++];
    }this._update();
    this._blockOffset = 0;
  }
  while (offset < data.length) {
    block[this._blockOffset++] = data[offset++];
  } // update length
  for (var j = 0, carry = data.length * 8; carry > 0; ++j) {
    this._length[j] += carry;
    carry = this._length[j] / 0x0100000000 | 0;
    if (carry > 0) this._length[j] -= 0x0100000000 * carry;
  }

  return this;
};

HashBase.prototype._update = function () {
  throw new Error('_update is not implemented');
};

HashBase.prototype.digest = function (encoding) {
  if (this._finalized) throw new Error('Digest already called');
  this._finalized = true;

  var digest = this._digest();
  if (encoding !== undefined) digest = digest.toString(encoding);

  // reset state
  this._block.fill(0);
  this._blockOffset = 0;
  for (var i = 0; i < 4; ++i) {
    this._length[i] = 0;
  }return digest;
};

HashBase.prototype._digest = function () {
  throw new Error('_digest is not implemented');
};

module.exports = HashBase;

},{"inherits":565,"safe-buffer":591,"stream":600}],564:[function(require,module,exports){
"use strict";

exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = -7;
  var i = isLE ? nBytes - 1 : 0;
  var d = isLE ? -1 : 1;
  var s = buffer[offset + i];

  i += d;

  e = s & (1 << -nBits) - 1;
  s >>= -nBits;
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & (1 << -nBits) - 1;
  e >>= -nBits;
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : (s ? -1 : 1) * Infinity;
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
  var i = isLE ? 0 : nBytes - 1;
  var d = isLE ? 1 : -1;
  var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = e << mLen | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128;
};

},{}],565:[function(require,module,exports){
arguments[4][8][0].apply(exports,arguments)
},{"dup":8}],566:[function(require,module,exports){
'use strict';

/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer);
};

function isBuffer(obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj);
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer(obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0));
}

},{}],567:[function(require,module,exports){
'use strict';

var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],568:[function(require,module,exports){
(function (global){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0,
    MAX_SAFE_INTEGER = 9007199254740991,
    MAX_INTEGER = 1.7976931348623157e+308,
    NAN = 0 / 0;

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/** Used to match leading and trailing whitespace. */
var reTrim = /^\s+|\s+$/g;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;

/** Used to compose unicode character classes. */
var rsAstralRange = '\\ud800-\\udfff',
    rsComboMarksRange = '\\u0300-\\u036f\\ufe20-\\ufe23',
    rsComboSymbolsRange = '\\u20d0-\\u20f0',
    rsVarRange = '\\ufe0e\\ufe0f';

/** Used to compose unicode capture groups. */
var rsAstral = '[' + rsAstralRange + ']',
    rsCombo = '[' + rsComboMarksRange + rsComboSymbolsRange + ']',
    rsFitz = '\\ud83c[\\udffb-\\udfff]',
    rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')',
    rsNonAstral = '[^' + rsAstralRange + ']',
    rsRegional = '(?:\\ud83c[\\udde6-\\uddff]){2}',
    rsSurrPair = '[\\ud800-\\udbff][\\udc00-\\udfff]',
    rsZWJ = '\\u200d';

/** Used to compose unicode regexes. */
var reOptMod = rsModifier + '?',
    rsOptVar = '[' + rsVarRange + ']?',
    rsOptJoin = '(?:' + rsZWJ + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*',
    rsSeq = rsOptVar + reOptMod + rsOptJoin,
    rsSymbol = '(?:' + [rsNonAstral + rsCombo + '?', rsCombo, rsRegional, rsSurrPair, rsAstral].join('|') + ')';

/** Used to match [string symbols](https://mathiasbynens.be/notes/javascript-unicode). */
var reUnicode = RegExp(rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq, 'g');

/** Used to detect strings with [zero-width joiners or code points from the astral planes](http://eev.ee/blog/2015/09/12/dark-corners-of-unicode/). */
var reHasUnicode = RegExp('[' + rsZWJ + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + ']');

/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;

/** Detect free variable `global` from Node.js. */
var freeGlobal = (typeof global === 'undefined' ? 'undefined' : _typeof(global)) == 'object' && global && global.Object === Object && global;

/** Detect free variable `self`. */
var freeSelf = (typeof self === 'undefined' ? 'undefined' : _typeof(self)) == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/**
 * Gets the size of an ASCII `string`.
 *
 * @private
 * @param {string} string The string inspect.
 * @returns {number} Returns the string size.
 */
var asciiSize = baseProperty('length');

/**
 * Converts an ASCII `string` to an array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the converted array.
 */
function asciiToArray(string) {
  return string.split('');
}

/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new accessor function.
 */
function baseProperty(key) {
  return function (object) {
    return object == null ? undefined : object[key];
  };
}

/**
 * Checks if `string` contains Unicode symbols.
 *
 * @private
 * @param {string} string The string to inspect.
 * @returns {boolean} Returns `true` if a symbol is found, else `false`.
 */
function hasUnicode(string) {
  return reHasUnicode.test(string);
}

/**
 * Gets the number of symbols in `string`.
 *
 * @private
 * @param {string} string The string to inspect.
 * @returns {number} Returns the string size.
 */
function stringSize(string) {
  return hasUnicode(string) ? unicodeSize(string) : asciiSize(string);
}

/**
 * Converts `string` to an array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the converted array.
 */
function stringToArray(string) {
  return hasUnicode(string) ? unicodeToArray(string) : asciiToArray(string);
}

/**
 * Gets the size of a Unicode `string`.
 *
 * @private
 * @param {string} string The string inspect.
 * @returns {number} Returns the string size.
 */
function unicodeSize(string) {
  var result = reUnicode.lastIndex = 0;
  while (reUnicode.test(string)) {
    result++;
  }
  return result;
}

/**
 * Converts a Unicode `string` to an array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the converted array.
 */
function unicodeToArray(string) {
  return string.match(reUnicode) || [];
}

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Built-in value references. */
var _Symbol = root.Symbol;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeCeil = Math.ceil,
    nativeFloor = Math.floor;

/** Used to convert symbols to primitives and strings. */
var symbolProto = _Symbol ? _Symbol.prototype : undefined,
    symbolToString = symbolProto ? symbolProto.toString : undefined;

/**
 * The base implementation of `_.repeat` which doesn't coerce arguments.
 *
 * @private
 * @param {string} string The string to repeat.
 * @param {number} n The number of times to repeat the string.
 * @returns {string} Returns the repeated string.
 */
function baseRepeat(string, n) {
  var result = '';
  if (!string || n < 1 || n > MAX_SAFE_INTEGER) {
    return result;
  }
  // Leverage the exponentiation by squaring algorithm for a faster repeat.
  // See https://en.wikipedia.org/wiki/Exponentiation_by_squaring for more details.
  do {
    if (n % 2) {
      result += string;
    }
    n = nativeFloor(n / 2);
    if (n) {
      string += string;
    }
  } while (n);

  return result;
}

/**
 * The base implementation of `_.slice` without an iteratee call guard.
 *
 * @private
 * @param {Array} array The array to slice.
 * @param {number} [start=0] The start position.
 * @param {number} [end=array.length] The end position.
 * @returns {Array} Returns the slice of `array`.
 */
function baseSlice(array, start, end) {
  var index = -1,
      length = array.length;

  if (start < 0) {
    start = -start > length ? 0 : length + start;
  }
  end = end > length ? length : end;
  if (end < 0) {
    end += length;
  }
  length = start > end ? 0 : end - start >>> 0;
  start >>>= 0;

  var result = Array(length);
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

/**
 * The base implementation of `_.toString` which doesn't convert nullish
 * values to empty strings.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value;
  }
  if (isSymbol(value)) {
    return symbolToString ? symbolToString.call(value) : '';
  }
  var result = value + '';
  return result == '0' && 1 / value == -INFINITY ? '-0' : result;
}

/**
 * Casts `array` to a slice if it's needed.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {number} start The start position.
 * @param {number} [end=array.length] The end position.
 * @returns {Array} Returns the cast slice.
 */
function castSlice(array, start, end) {
  var length = array.length;
  end = end === undefined ? length : end;
  return !start && end >= length ? array : baseSlice(array, start, end);
}

/**
 * Creates the padding for `string` based on `length`. The `chars` string
 * is truncated if the number of characters exceeds `length`.
 *
 * @private
 * @param {number} length The padding length.
 * @param {string} [chars=' '] The string used as padding.
 * @returns {string} Returns the padding for `string`.
 */
function createPadding(length, chars) {
  chars = chars === undefined ? ' ' : baseToString(chars);

  var charsLength = chars.length;
  if (charsLength < 2) {
    return charsLength ? baseRepeat(chars, length) : chars;
  }
  var result = baseRepeat(chars, nativeCeil(length / stringSize(chars)));
  return hasUnicode(chars) ? castSlice(stringToArray(result), 0, length).join('') : result.slice(0, length);
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value === 'undefined' ? 'undefined' : _typeof(value);
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && (typeof value === 'undefined' ? 'undefined' : _typeof(value)) == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return (typeof value === 'undefined' ? 'undefined' : _typeof(value)) == 'symbol' || isObjectLike(value) && objectToString.call(value) == symbolTag;
}

/**
 * Converts `value` to a finite number.
 *
 * @static
 * @memberOf _
 * @since 4.12.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {number} Returns the converted number.
 * @example
 *
 * _.toFinite(3.2);
 * // => 3.2
 *
 * _.toFinite(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toFinite(Infinity);
 * // => 1.7976931348623157e+308
 *
 * _.toFinite('3.2');
 * // => 3.2
 */
function toFinite(value) {
  if (!value) {
    return value === 0 ? value : 0;
  }
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    var sign = value < 0 ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

/**
 * Converts `value` to an integer.
 *
 * **Note:** This method is loosely based on
 * [`ToInteger`](http://www.ecma-international.org/ecma-262/7.0/#sec-tointeger).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {number} Returns the converted integer.
 * @example
 *
 * _.toInteger(3.2);
 * // => 3
 *
 * _.toInteger(Number.MIN_VALUE);
 * // => 0
 *
 * _.toInteger(Infinity);
 * // => 1.7976931348623157e+308
 *
 * _.toInteger('3.2');
 * // => 3
 */
function toInteger(value) {
  var result = toFinite(value),
      remainder = result % 1;

  return result === result ? remainder ? result - remainder : result : 0;
}

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3.2);
 * // => 3.2
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3.2');
 * // => 3.2
 */
function toNumber(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject(value)) {
    var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
    value = isObject(other) ? other + '' : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
}

/**
 * Converts `value` to a string. An empty string is returned for `null`
 * and `undefined` values. The sign of `-0` is preserved.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 * @example
 *
 * _.toString(null);
 * // => ''
 *
 * _.toString(-0);
 * // => '-0'
 *
 * _.toString([1, 2, 3]);
 * // => '1,2,3'
 */
function toString(value) {
  return value == null ? '' : baseToString(value);
}

/**
 * Pads `string` on the left side if it's shorter than `length`. Padding
 * characters are truncated if they exceed `length`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category String
 * @param {string} [string=''] The string to pad.
 * @param {number} [length=0] The padding length.
 * @param {string} [chars=' '] The string used as padding.
 * @returns {string} Returns the padded string.
 * @example
 *
 * _.padStart('abc', 6);
 * // => '   abc'
 *
 * _.padStart('abc', 6, '_-');
 * // => '_-_abc'
 *
 * _.padStart('abc', 3);
 * // => 'abc'
 */
function padStart(string, length, chars) {
  string = toString(string);
  length = toInteger(length);

  var strLength = length ? stringSize(string) : 0;
  return length && strLength < length ? createPadding(length - strLength, chars) + string : string;
}

module.exports = padStart;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],569:[function(require,module,exports){
(function (Buffer){
'use strict';

var inherits = require('inherits');
var HashBase = require('hash-base');

var ARRAY16 = new Array(16);

function MD5() {
  HashBase.call(this, 64);

  // state
  this._a = 0x67452301;
  this._b = 0xefcdab89;
  this._c = 0x98badcfe;
  this._d = 0x10325476;
}

inherits(MD5, HashBase);

MD5.prototype._update = function () {
  var M = ARRAY16;
  for (var i = 0; i < 16; ++i) {
    M[i] = this._block.readInt32LE(i * 4);
  }var a = this._a;
  var b = this._b;
  var c = this._c;
  var d = this._d;

  a = fnF(a, b, c, d, M[0], 0xd76aa478, 7);
  d = fnF(d, a, b, c, M[1], 0xe8c7b756, 12);
  c = fnF(c, d, a, b, M[2], 0x242070db, 17);
  b = fnF(b, c, d, a, M[3], 0xc1bdceee, 22);
  a = fnF(a, b, c, d, M[4], 0xf57c0faf, 7);
  d = fnF(d, a, b, c, M[5], 0x4787c62a, 12);
  c = fnF(c, d, a, b, M[6], 0xa8304613, 17);
  b = fnF(b, c, d, a, M[7], 0xfd469501, 22);
  a = fnF(a, b, c, d, M[8], 0x698098d8, 7);
  d = fnF(d, a, b, c, M[9], 0x8b44f7af, 12);
  c = fnF(c, d, a, b, M[10], 0xffff5bb1, 17);
  b = fnF(b, c, d, a, M[11], 0x895cd7be, 22);
  a = fnF(a, b, c, d, M[12], 0x6b901122, 7);
  d = fnF(d, a, b, c, M[13], 0xfd987193, 12);
  c = fnF(c, d, a, b, M[14], 0xa679438e, 17);
  b = fnF(b, c, d, a, M[15], 0x49b40821, 22);

  a = fnG(a, b, c, d, M[1], 0xf61e2562, 5);
  d = fnG(d, a, b, c, M[6], 0xc040b340, 9);
  c = fnG(c, d, a, b, M[11], 0x265e5a51, 14);
  b = fnG(b, c, d, a, M[0], 0xe9b6c7aa, 20);
  a = fnG(a, b, c, d, M[5], 0xd62f105d, 5);
  d = fnG(d, a, b, c, M[10], 0x02441453, 9);
  c = fnG(c, d, a, b, M[15], 0xd8a1e681, 14);
  b = fnG(b, c, d, a, M[4], 0xe7d3fbc8, 20);
  a = fnG(a, b, c, d, M[9], 0x21e1cde6, 5);
  d = fnG(d, a, b, c, M[14], 0xc33707d6, 9);
  c = fnG(c, d, a, b, M[3], 0xf4d50d87, 14);
  b = fnG(b, c, d, a, M[8], 0x455a14ed, 20);
  a = fnG(a, b, c, d, M[13], 0xa9e3e905, 5);
  d = fnG(d, a, b, c, M[2], 0xfcefa3f8, 9);
  c = fnG(c, d, a, b, M[7], 0x676f02d9, 14);
  b = fnG(b, c, d, a, M[12], 0x8d2a4c8a, 20);

  a = fnH(a, b, c, d, M[5], 0xfffa3942, 4);
  d = fnH(d, a, b, c, M[8], 0x8771f681, 11);
  c = fnH(c, d, a, b, M[11], 0x6d9d6122, 16);
  b = fnH(b, c, d, a, M[14], 0xfde5380c, 23);
  a = fnH(a, b, c, d, M[1], 0xa4beea44, 4);
  d = fnH(d, a, b, c, M[4], 0x4bdecfa9, 11);
  c = fnH(c, d, a, b, M[7], 0xf6bb4b60, 16);
  b = fnH(b, c, d, a, M[10], 0xbebfbc70, 23);
  a = fnH(a, b, c, d, M[13], 0x289b7ec6, 4);
  d = fnH(d, a, b, c, M[0], 0xeaa127fa, 11);
  c = fnH(c, d, a, b, M[3], 0xd4ef3085, 16);
  b = fnH(b, c, d, a, M[6], 0x04881d05, 23);
  a = fnH(a, b, c, d, M[9], 0xd9d4d039, 4);
  d = fnH(d, a, b, c, M[12], 0xe6db99e5, 11);
  c = fnH(c, d, a, b, M[15], 0x1fa27cf8, 16);
  b = fnH(b, c, d, a, M[2], 0xc4ac5665, 23);

  a = fnI(a, b, c, d, M[0], 0xf4292244, 6);
  d = fnI(d, a, b, c, M[7], 0x432aff97, 10);
  c = fnI(c, d, a, b, M[14], 0xab9423a7, 15);
  b = fnI(b, c, d, a, M[5], 0xfc93a039, 21);
  a = fnI(a, b, c, d, M[12], 0x655b59c3, 6);
  d = fnI(d, a, b, c, M[3], 0x8f0ccc92, 10);
  c = fnI(c, d, a, b, M[10], 0xffeff47d, 15);
  b = fnI(b, c, d, a, M[1], 0x85845dd1, 21);
  a = fnI(a, b, c, d, M[8], 0x6fa87e4f, 6);
  d = fnI(d, a, b, c, M[15], 0xfe2ce6e0, 10);
  c = fnI(c, d, a, b, M[6], 0xa3014314, 15);
  b = fnI(b, c, d, a, M[13], 0x4e0811a1, 21);
  a = fnI(a, b, c, d, M[4], 0xf7537e82, 6);
  d = fnI(d, a, b, c, M[11], 0xbd3af235, 10);
  c = fnI(c, d, a, b, M[2], 0x2ad7d2bb, 15);
  b = fnI(b, c, d, a, M[9], 0xeb86d391, 21);

  this._a = this._a + a | 0;
  this._b = this._b + b | 0;
  this._c = this._c + c | 0;
  this._d = this._d + d | 0;
};

MD5.prototype._digest = function () {
  // create padding and handle blocks
  this._block[this._blockOffset++] = 0x80;
  if (this._blockOffset > 56) {
    this._block.fill(0, this._blockOffset, 64);
    this._update();
    this._blockOffset = 0;
  }

  this._block.fill(0, this._blockOffset, 56);
  this._block.writeUInt32LE(this._length[0], 56);
  this._block.writeUInt32LE(this._length[1], 60);
  this._update();

  // produce result
  var buffer = new Buffer(16);
  buffer.writeInt32LE(this._a, 0);
  buffer.writeInt32LE(this._b, 4);
  buffer.writeInt32LE(this._c, 8);
  buffer.writeInt32LE(this._d, 12);
  return buffer;
};

function rotl(x, n) {
  return x << n | x >>> 32 - n;
}

function fnF(a, b, c, d, m, k, s) {
  return rotl(a + (b & c | ~b & d) + m + k | 0, s) + b | 0;
}

function fnG(a, b, c, d, m, k, s) {
  return rotl(a + (b & d | c & ~d) + m + k | 0, s) + b | 0;
}

function fnH(a, b, c, d, m, k, s) {
  return rotl(a + (b ^ c ^ d) + m + k | 0, s) + b | 0;
}

function fnI(a, b, c, d, m, k, s) {
  return rotl(a + (c ^ (b | ~d)) + m + k | 0, s) + b | 0;
}

module.exports = MD5;

}).call(this,require("buffer").Buffer)
},{"buffer":121,"hash-base":563,"inherits":565}],570:[function(require,module,exports){
(function (Buffer){
'use strict';

// constant-space merkle root calculation algorithm
module.exports = function fastRoot(values, digestFn) {
  if (!Array.isArray(values)) throw TypeError('Expected values Array');
  if (typeof digestFn !== 'function') throw TypeError('Expected digest Function');

  var length = values.length;
  var results = values.concat();

  while (length > 1) {
    var j = 0;

    for (var i = 0; i < length; i += 2, ++j) {
      var left = results[i];
      var right = i + 1 === length ? left : results[i + 1];
      var data = Buffer.concat([left, right]);

      results[j] = digestFn(data);
    }

    length = j;
  }

  return results[0];
};

}).call(this,require("buffer").Buffer)
},{"buffer":121}],571:[function(require,module,exports){
(function (process){
'use strict';

if (!process.version || process.version.indexOf('v0.') === 0 || process.version.indexOf('v1.') === 0 && process.version.indexOf('v1.8.') !== 0) {
  module.exports = { nextTick: nextTick };
} else {
  module.exports = process;
}

function nextTick(fn, arg1, arg2, arg3) {
  if (typeof fn !== 'function') {
    throw new TypeError('"callback" argument must be a function');
  }
  var len = arguments.length;
  var args, i;
  switch (len) {
    case 0:
    case 1:
      return process.nextTick(fn);
    case 2:
      return process.nextTick(function afterTickOne() {
        fn.call(null, arg1);
      });
    case 3:
      return process.nextTick(function afterTickTwo() {
        fn.call(null, arg1, arg2);
      });
    case 4:
      return process.nextTick(function afterTickThree() {
        fn.call(null, arg1, arg2, arg3);
      });
    default:
      args = new Array(len - 1);
      i = 0;
      while (i < args.length) {
        args[i++] = arguments[i];
      }
      return process.nextTick(function afterTick() {
        fn.apply(null, args);
      });
  }
}

}).call(this,require('_process'))
},{"_process":572}],572:[function(require,module,exports){
'use strict';

// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout() {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
})();
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch (e) {
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch (e) {
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }
}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e) {
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e) {
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }
}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while (len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) {
    return [];
};

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () {
    return '/';
};
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function () {
    return 0;
};

},{}],573:[function(require,module,exports){
'use strict';

var OPS = require('bitcoin-ops');

function encodingLength(i) {
  return i < OPS.OP_PUSHDATA1 ? 1 : i <= 0xff ? 2 : i <= 0xffff ? 3 : 5;
}

function encode(buffer, number, offset) {
  var size = encodingLength(number);

  // ~6 bit
  if (size === 1) {
    buffer.writeUInt8(number, offset);

    // 8 bit
  } else if (size === 2) {
    buffer.writeUInt8(OPS.OP_PUSHDATA1, offset);
    buffer.writeUInt8(number, offset + 1);

    // 16 bit
  } else if (size === 3) {
    buffer.writeUInt8(OPS.OP_PUSHDATA2, offset);
    buffer.writeUInt16LE(number, offset + 1);

    // 32 bit
  } else {
    buffer.writeUInt8(OPS.OP_PUSHDATA4, offset);
    buffer.writeUInt32LE(number, offset + 1);
  }

  return size;
}

function decode(buffer, offset) {
  var opcode = buffer.readUInt8(offset);
  var number, size;

  // ~6 bit
  if (opcode < OPS.OP_PUSHDATA1) {
    number = opcode;
    size = 1;

    // 8 bit
  } else if (opcode === OPS.OP_PUSHDATA1) {
    if (offset + 2 > buffer.length) return null;
    number = buffer.readUInt8(offset + 1);
    size = 2;

    // 16 bit
  } else if (opcode === OPS.OP_PUSHDATA2) {
    if (offset + 3 > buffer.length) return null;
    number = buffer.readUInt16LE(offset + 1);
    size = 3;

    // 32 bit
  } else {
    if (offset + 5 > buffer.length) return null;
    if (opcode !== OPS.OP_PUSHDATA4) throw new Error('Unexpected opcode');

    number = buffer.readUInt32LE(offset + 1);
    size = 5;
  }

  return {
    opcode: opcode,
    number: number,
    size: size
  };
}

module.exports = {
  encodingLength: encodingLength,
  encode: encode,
  decode: decode
};

},{"bitcoin-ops":41}],574:[function(require,module,exports){
(function (process,global){
'use strict';

function oldBrowser() {
  throw new Error('Secure random number generation is not supported by this browser.\nUse Chrome, Firefox or Internet Explorer 11');
}

var Buffer = require('safe-buffer').Buffer;
var crypto = global.crypto || global.msCrypto;

if (crypto && crypto.getRandomValues) {
  module.exports = randomBytes;
} else {
  module.exports = oldBrowser;
}

function randomBytes(size, cb) {
  // phantomjs needs to throw
  if (size > 65536) throw new Error('requested too many random bytes');
  // in case browserify  isn't using the Uint8Array version
  var rawBytes = new global.Uint8Array(size);

  // This will not work in older browsers.
  // See https://developer.mozilla.org/en-US/docs/Web/API/window.crypto.getRandomValues
  if (size > 0) {
    // getRandomValues fails on IE if size == 0
    crypto.getRandomValues(rawBytes);
  }

  // XXX: phantomjs doesn't like a buffer being passed here
  var bytes = Buffer.from(rawBytes.buffer);

  if (typeof cb === 'function') {
    return process.nextTick(function () {
      cb(null, bytes);
    });
  }

  return bytes;
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":572,"safe-buffer":591}],575:[function(require,module,exports){
'use strict';

module.exports = require('./lib/_stream_duplex.js');

},{"./lib/_stream_duplex.js":576}],576:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

'use strict';

/*<replacement>*/

var pna = require('process-nextick-args');
/*</replacement>*/

/*<replacement>*/
var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    keys.push(key);
  }return keys;
};
/*</replacement>*/

module.exports = Duplex;

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

{
  // avoid scope creep, the keys array can then be collected
  var keys = objectKeys(Writable.prototype);
  for (var v = 0; v < keys.length; v++) {
    var method = keys[v];
    if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
  }
}

function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false) this.readable = false;

  if (options && options.writable === false) this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false) this.allowHalfOpen = false;

  this.once('end', onend);
}

Object.defineProperty(Duplex.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.highWaterMark;
  }
});

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended) return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  pna.nextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

Object.defineProperty(Duplex.prototype, 'destroyed', {
  get: function get() {
    if (this._readableState === undefined || this._writableState === undefined) {
      return false;
    }
    return this._readableState.destroyed && this._writableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (this._readableState === undefined || this._writableState === undefined) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._readableState.destroyed = value;
    this._writableState.destroyed = value;
  }
});

Duplex.prototype._destroy = function (err, cb) {
  this.push(null);
  this.end();

  pna.nextTick(cb, err);
};

},{"./_stream_readable":578,"./_stream_writable":580,"core-util-is":552,"inherits":565,"process-nextick-args":571}],577:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

'use strict';

module.exports = PassThrough;

var Transform = require('./_stream_transform');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough)) return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};

},{"./_stream_transform":579,"core-util-is":552,"inherits":565}],578:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

/*<replacement>*/

var pna = require('process-nextick-args');
/*</replacement>*/

module.exports = Readable;

/*<replacement>*/
var isArray = require('isarray');
/*</replacement>*/

/*<replacement>*/
var Duplex;
/*</replacement>*/

Readable.ReadableState = ReadableState;

/*<replacement>*/
var EE = require('events').EventEmitter;

var EElistenerCount = function EElistenerCount(emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

/*<replacement>*/
var Stream = require('./internal/streams/stream');
/*</replacement>*/

/*<replacement>*/

var Buffer = require('safe-buffer').Buffer;
var OurUint8Array = global.Uint8Array || function () {};
function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}
function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}

/*</replacement>*/

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

/*<replacement>*/
var debugUtil = require('util');
var debug = void 0;
if (debugUtil && debugUtil.debuglog) {
  debug = debugUtil.debuglog('stream');
} else {
  debug = function debug() {};
}
/*</replacement>*/

var BufferList = require('./internal/streams/BufferList');
var destroyImpl = require('./internal/streams/destroy');
var StringDecoder;

util.inherits(Readable, Stream);

var kProxyEvents = ['error', 'close', 'destroy', 'pause', 'resume'];

function prependListener(emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
  if (typeof emitter.prependListener === 'function') return emitter.prependListener(event, fn);

  // This is a hack to make sure that our error handler is attached before any
  // userland ones.  NEVER DO THIS. This is here only because this code needs
  // to continue to work with older versions of Node.js that do not include
  // the prependListener() method. The goal is to eventually remove this hack.
  if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);else if (isArray(emitter._events[event])) emitter._events[event].unshift(fn);else emitter._events[event] = [fn, emitter._events[event]];
}

function ReadableState(options, stream) {
  Duplex = Duplex || require('./_stream_duplex');

  options = options || {};

  // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream.
  // These options can be provided separately as readableXXX and writableXXX.
  var isDuplex = stream instanceof Duplex;

  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode;

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var readableHwm = options.readableHighWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;

  if (hwm || hwm === 0) this.highWaterMark = hwm;else if (isDuplex && (readableHwm || readableHwm === 0)) this.highWaterMark = readableHwm;else this.highWaterMark = defaultHwm;

  // cast to ints.
  this.highWaterMark = Math.floor(this.highWaterMark);

  // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()
  this.buffer = new BufferList();
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the event 'readable'/'data' is emitted
  // immediately, or on a later tick.  We set this to true at first, because
  // any actions that shouldn't happen until "later" should generally also
  // not happen before the first read call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;

  // has it been destroyed
  this.destroyed = false;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  Duplex = Duplex || require('./_stream_duplex');

  if (!(this instanceof Readable)) return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  if (options) {
    if (typeof options.read === 'function') this._read = options.read;

    if (typeof options.destroy === 'function') this._destroy = options.destroy;
  }

  Stream.call(this);
}

Object.defineProperty(Readable.prototype, 'destroyed', {
  get: function get() {
    if (this._readableState === undefined) {
      return false;
    }
    return this._readableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._readableState) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._readableState.destroyed = value;
  }
});

Readable.prototype.destroy = destroyImpl.destroy;
Readable.prototype._undestroy = destroyImpl.undestroy;
Readable.prototype._destroy = function (err, cb) {
  this.push(null);
  cb(err);
};

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function (chunk, encoding) {
  var state = this._readableState;
  var skipChunkCheck;

  if (!state.objectMode) {
    if (typeof chunk === 'string') {
      encoding = encoding || state.defaultEncoding;
      if (encoding !== state.encoding) {
        chunk = Buffer.from(chunk, encoding);
        encoding = '';
      }
      skipChunkCheck = true;
    }
  } else {
    skipChunkCheck = true;
  }

  return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function (chunk) {
  return readableAddChunk(this, chunk, null, true, false);
};

function readableAddChunk(stream, chunk, encoding, addToFront, skipChunkCheck) {
  var state = stream._readableState;
  if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else {
    var er;
    if (!skipChunkCheck) er = chunkInvalid(state, chunk);
    if (er) {
      stream.emit('error', er);
    } else if (state.objectMode || chunk && chunk.length > 0) {
      if (typeof chunk !== 'string' && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer.prototype) {
        chunk = _uint8ArrayToBuffer(chunk);
      }

      if (addToFront) {
        if (state.endEmitted) stream.emit('error', new Error('stream.unshift() after end event'));else addChunk(stream, state, chunk, true);
      } else if (state.ended) {
        stream.emit('error', new Error('stream.push() after EOF'));
      } else {
        state.reading = false;
        if (state.decoder && !encoding) {
          chunk = state.decoder.write(chunk);
          if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);else maybeReadMore(stream, state);
        } else {
          addChunk(stream, state, chunk, false);
        }
      }
    } else if (!addToFront) {
      state.reading = false;
    }
  }

  return needMoreData(state);
}

function addChunk(stream, state, chunk, addToFront) {
  if (state.flowing && state.length === 0 && !state.sync) {
    stream.emit('data', chunk);
    stream.read(0);
  } else {
    // update the buffer info.
    state.length += state.objectMode ? 1 : chunk.length;
    if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);

    if (state.needReadable) emitReadable(stream);
  }
  maybeReadMore(stream, state);
}

function chunkInvalid(state, chunk) {
  var er;
  if (!_isUint8Array(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}

// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0);
}

Readable.prototype.isPaused = function () {
  return this._readableState.flowing === false;
};

// backwards compatibility.
Readable.prototype.setEncoding = function (enc) {
  if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 8MB
var MAX_HWM = 0x800000;
function computeNewHighWaterMark(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }
  return n;
}

// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function howMuchToRead(n, state) {
  if (n <= 0 || state.length === 0 && state.ended) return 0;
  if (state.objectMode) return 1;
  if (n !== n) {
    // Only flow one buffer at a time
    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
  }
  // If we're asking for more than the current hwm, then raise the hwm.
  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
  if (n <= state.length) return n;
  // Don't have enough
  if (!state.ended) {
    state.needReadable = true;
    return 0;
  }
  return state.length;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function (n) {
  debug('read', n);
  n = parseInt(n, 10);
  var state = this._readableState;
  var nOrig = n;

  if (n !== 0) state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  } else if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0) state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
    // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.
    if (!state.reading) n = howMuchToRead(nOrig, state);
  }

  var ret;
  if (n > 0) ret = fromList(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  } else {
    state.length -= n;
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended) state.needReadable = true;

    // If we tried to read() past the EOF, then emit end on the next tick.
    if (nOrig !== n && state.ended) endReadable(this);
  }

  if (ret !== null) this.emit('data', ret);

  return ret;
};

function onEofChunk(stream, state) {
  if (state.ended) return;
  if (state.decoder) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync) pna.nextTick(emitReadable_, stream);else emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}

// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    pna.nextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;else len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function (n) {
  this.emit('error', new Error('_read() is not implemented'));
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;

  var endFn = doEnd ? onend : unpipe;
  if (state.endEmitted) pna.nextTick(endFn);else src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable, unpipeInfo) {
    debug('onunpipe');
    if (readable === src) {
      if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
        unpipeInfo.hasUnpiped = true;
        cleanup();
      }
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  var cleanedUp = false;
  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', unpipe);
    src.removeListener('data', ondata);

    cleanedUp = true;

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  // If the user pushes more data while we're writing to dest then we'll end up
  // in ondata again. However, we only want to increase awaitDrain once because
  // dest will only emit one 'drain' event for the multiple writes.
  // => Introduce a guard on increasing awaitDrain.
  var increasedAwaitDrain = false;
  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    increasedAwaitDrain = false;
    var ret = dest.write(chunk);
    if (false === ret && !increasedAwaitDrain) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
        debug('false write response, pause', src._readableState.awaitDrain);
        src._readableState.awaitDrain++;
        increasedAwaitDrain = true;
      }
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EElistenerCount(dest, 'error') === 0) dest.emit('error', er);
  }

  // Make sure our error handler is attached before userland ones.
  prependListener(dest, 'error', onerror);

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function () {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;
    if (state.awaitDrain === 0 && EElistenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}

Readable.prototype.unpipe = function (dest) {
  var state = this._readableState;
  var unpipeInfo = { hasUnpiped: false };

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0) return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;

    if (!dest) dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this, unpipeInfo);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++) {
      dests[i].emit('unpipe', this, unpipeInfo);
    }return this;
  }

  // try to find the right one.
  var index = indexOf(state.pipes, dest);
  if (index === -1) return this;

  state.pipes.splice(index, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];

  dest.emit('unpipe', this, unpipeInfo);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function (ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data') {
    // Start flowing on next tick if stream isn't explicitly paused
    if (this._readableState.flowing !== false) this.resume();
  } else if (ev === 'readable') {
    var state = this._readableState;
    if (!state.endEmitted && !state.readableListening) {
      state.readableListening = state.needReadable = true;
      state.emittedReadable = false;
      if (!state.reading) {
        pna.nextTick(nReadingNextTick, this);
      } else if (state.length) {
        emitReadable(this);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
}

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function () {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    pna.nextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  if (!state.reading) {
    debug('resume read 0');
    stream.read(0);
  }

  state.resumeScheduled = false;
  state.awaitDrain = 0;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable.prototype.pause = function () {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  while (state.flowing && stream.read() !== null) {}
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function (stream) {
  var _this = this;

  var state = this._readableState;
  var paused = false;

  stream.on('end', function () {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) _this.push(chunk);
    }

    _this.push(null);
  });

  stream.on('data', function (chunk) {
    debug('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk);

    // don't skip over falsy values in objectMode
    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = _this.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function (method) {
        return function () {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  }

  // proxy certain important events.
  for (var n = 0; n < kProxyEvents.length; n++) {
    stream.on(kProxyEvents[n], this.emit.bind(this, kProxyEvents[n]));
  }

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  this._read = function (n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return this;
};

Object.defineProperty(Readable.prototype, 'readableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.highWaterMark;
  }
});

// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromList(n, state) {
  // nothing buffered
  if (state.length === 0) return null;

  var ret;
  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
    // read it all, truncate the list
    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.head.data;else ret = state.buffer.concat(state.length);
    state.buffer.clear();
  } else {
    // read part of list
    ret = fromListPartial(n, state.buffer, state.decoder);
  }

  return ret;
}

// Extracts only enough buffered data to satisfy the amount requested.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromListPartial(n, list, hasStrings) {
  var ret;
  if (n < list.head.data.length) {
    // slice is the same for buffers and strings
    ret = list.head.data.slice(0, n);
    list.head.data = list.head.data.slice(n);
  } else if (n === list.head.data.length) {
    // first chunk is a perfect match
    ret = list.shift();
  } else {
    // result spans more than one buffer
    ret = hasStrings ? copyFromBufferString(n, list) : copyFromBuffer(n, list);
  }
  return ret;
}

// Copies a specified amount of characters from the list of buffered data
// chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBufferString(n, list) {
  var p = list.head;
  var c = 1;
  var ret = p.data;
  n -= ret.length;
  while (p = p.next) {
    var str = p.data;
    var nb = n > str.length ? str.length : n;
    if (nb === str.length) ret += str;else ret += str.slice(0, n);
    n -= nb;
    if (n === 0) {
      if (nb === str.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = str.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

// Copies a specified amount of bytes from the list of buffered data chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBuffer(n, list) {
  var ret = Buffer.allocUnsafe(n);
  var p = list.head;
  var c = 1;
  p.data.copy(ret);
  n -= p.data.length;
  while (p = p.next) {
    var buf = p.data;
    var nb = n > buf.length ? buf.length : n;
    buf.copy(ret, ret.length - n, 0, nb);
    n -= nb;
    if (n === 0) {
      if (nb === buf.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = buf.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0) throw new Error('"endReadable()" called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    pna.nextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  // Check that we didn't get one last unshift.
  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');
  }
}

function indexOf(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./_stream_duplex":576,"./internal/streams/BufferList":581,"./internal/streams/destroy":582,"./internal/streams/stream":583,"_process":572,"core-util-is":552,"events":562,"inherits":565,"isarray":567,"process-nextick-args":571,"safe-buffer":591,"string_decoder/":601,"util":117}],579:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

'use strict';

module.exports = Transform;

var Duplex = require('./_stream_duplex');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(Transform, Duplex);

function afterTransform(er, data) {
  var ts = this._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb) {
    return this.emit('error', new Error('write callback called multiple times'));
  }

  ts.writechunk = null;
  ts.writecb = null;

  if (data != null) // single equals check for both `null` and `undefined`
    this.push(data);

  cb(er);

  var rs = this._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    this._read(rs.highWaterMark);
  }
}

function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);

  Duplex.call(this, options);

  this._transformState = {
    afterTransform: afterTransform.bind(this),
    needTransform: false,
    transforming: false,
    writecb: null,
    writechunk: null,
    writeencoding: null
  };

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;

    if (typeof options.flush === 'function') this._flush = options.flush;
  }

  // When the writable side finishes, then flush out anything remaining.
  this.on('prefinish', prefinish);
}

function prefinish() {
  var _this = this;

  if (typeof this._flush === 'function') {
    this._flush(function (er, data) {
      done(_this, er, data);
    });
  } else {
    done(this, null, null);
  }
}

Transform.prototype.push = function (chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function (chunk, encoding, cb) {
  throw new Error('_transform() is not implemented');
};

Transform.prototype._write = function (chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function (n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};

Transform.prototype._destroy = function (err, cb) {
  var _this2 = this;

  Duplex.prototype._destroy.call(this, err, function (err2) {
    cb(err2);
    _this2.emit('close');
  });
};

function done(stream, er, data) {
  if (er) return stream.emit('error', er);

  if (data != null) // single equals check for both `null` and `undefined`
    stream.push(data);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  if (stream._writableState.length) throw new Error('Calling transform done when ws.length != 0');

  if (stream._transformState.transforming) throw new Error('Calling transform done when still transforming');

  return stream.push(null);
}

},{"./_stream_duplex":576,"core-util-is":552,"inherits":565}],580:[function(require,module,exports){
(function (process,global,setImmediate){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.

'use strict';

/*<replacement>*/

var pna = require('process-nextick-args');
/*</replacement>*/

module.exports = Writable;

/* <replacement> */
function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
}

// It seems a linked list but it is not
// there will be only 2 of these for each stream
function CorkedRequest(state) {
  var _this = this;

  this.next = null;
  this.entry = null;
  this.finish = function () {
    onCorkedFinish(_this, state);
  };
}
/* </replacement> */

/*<replacement>*/
var asyncWrite = !process.browser && ['v0.10', 'v0.9.'].indexOf(process.version.slice(0, 5)) > -1 ? setImmediate : pna.nextTick;
/*</replacement>*/

/*<replacement>*/
var Duplex;
/*</replacement>*/

Writable.WritableState = WritableState;

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

/*<replacement>*/
var internalUtil = {
  deprecate: require('util-deprecate')
};
/*</replacement>*/

/*<replacement>*/
var Stream = require('./internal/streams/stream');
/*</replacement>*/

/*<replacement>*/

var Buffer = require('safe-buffer').Buffer;
var OurUint8Array = global.Uint8Array || function () {};
function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}
function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}

/*</replacement>*/

var destroyImpl = require('./internal/streams/destroy');

util.inherits(Writable, Stream);

function nop() {}

function WritableState(options, stream) {
  Duplex = Duplex || require('./_stream_duplex');

  options = options || {};

  // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream.
  // These options can be provided separately as readableXXX and writableXXX.
  var isDuplex = stream instanceof Duplex;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode;

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var writableHwm = options.writableHighWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;

  if (hwm || hwm === 0) this.highWaterMark = hwm;else if (isDuplex && (writableHwm || writableHwm === 0)) this.highWaterMark = writableHwm;else this.highWaterMark = defaultHwm;

  // cast to ints.
  this.highWaterMark = Math.floor(this.highWaterMark);

  // if _final has been called
  this.finalCalled = false;

  // drain event flag.
  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // has it been destroyed
  this.destroyed = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function (er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.bufferedRequest = null;
  this.lastBufferedRequest = null;

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;

  // count buffered requests
  this.bufferedRequestCount = 0;

  // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two
  this.corkedRequestsFree = new CorkedRequest(this);
}

WritableState.prototype.getBuffer = function getBuffer() {
  var current = this.bufferedRequest;
  var out = [];
  while (current) {
    out.push(current);
    current = current.next;
  }
  return out;
};

(function () {
  try {
    Object.defineProperty(WritableState.prototype, 'buffer', {
      get: internalUtil.deprecate(function () {
        return this.getBuffer();
      }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.', 'DEP0003')
    });
  } catch (_) {}
})();

// Test _writableState for inheritance to account for Duplex streams,
// whose prototype chain only points to Readable.
var realHasInstance;
if (typeof Symbol === 'function' && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === 'function') {
  realHasInstance = Function.prototype[Symbol.hasInstance];
  Object.defineProperty(Writable, Symbol.hasInstance, {
    value: function value(object) {
      if (realHasInstance.call(this, object)) return true;
      if (this !== Writable) return false;

      return object && object._writableState instanceof WritableState;
    }
  });
} else {
  realHasInstance = function realHasInstance(object) {
    return object instanceof this;
  };
}

function Writable(options) {
  Duplex = Duplex || require('./_stream_duplex');

  // Writable ctor is applied to Duplexes, too.
  // `realHasInstance` is necessary because using plain `instanceof`
  // would return false, as no `_writableState` property is attached.

  // Trying to use the custom `instanceof` for Writable here will also break the
  // Node.js LazyTransform implementation, which has a non-trivial getter for
  // `_writableState` that would lead to infinite recursion.
  if (!realHasInstance.call(Writable, this) && !(this instanceof Duplex)) {
    return new Writable(options);
  }

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;

    if (typeof options.writev === 'function') this._writev = options.writev;

    if (typeof options.destroy === 'function') this._destroy = options.destroy;

    if (typeof options.final === 'function') this._final = options.final;
  }

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function () {
  this.emit('error', new Error('Cannot pipe, not readable'));
};

function writeAfterEnd(stream, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  pna.nextTick(cb, er);
}

// Checks that a user-supplied chunk is valid, especially for the particular
// mode the stream is in. Currently this means that `null` is never accepted
// and undefined/non-string values are only allowed in object mode.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  var er = false;

  if (chunk === null) {
    er = new TypeError('May not write null values to stream');
  } else if (typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  if (er) {
    stream.emit('error', er);
    pna.nextTick(cb, er);
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;
  var isBuf = !state.objectMode && _isUint8Array(chunk);

  if (isBuf && !Buffer.isBuffer(chunk)) {
    chunk = _uint8ArrayToBuffer(chunk);
  }

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (isBuf) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;

  if (typeof cb !== 'function') cb = nop;

  if (state.ended) writeAfterEnd(this, cb);else if (isBuf || validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function () {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing && !state.corked && !state.finished && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new TypeError('Unknown encoding: ' + encoding);
  this._writableState.defaultEncoding = encoding;
  return this;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding);
  }
  return chunk;
}

Object.defineProperty(Writable.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.highWaterMark;
  }
});

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, isBuf, chunk, encoding, cb) {
  if (!isBuf) {
    var newChunk = decodeChunk(state, chunk, encoding);
    if (chunk !== newChunk) {
      isBuf = true;
      encoding = 'buffer';
      chunk = newChunk;
    }
  }
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = {
      chunk: chunk,
      encoding: encoding,
      isBuf: isBuf,
      callback: cb,
      next: null
    };
    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }
    state.bufferedRequestCount += 1;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;

  if (sync) {
    // defer the callback if we are being called synchronously
    // to avoid piling up things on the stack
    pna.nextTick(cb, er);
    // this can emit finish, and it will always happen
    // after error
    pna.nextTick(finishMaybe, stream, state);
    stream._writableState.errorEmitted = true;
    stream.emit('error', er);
  } else {
    // the caller expect this to happen before if
    // it is async
    cb(er);
    stream._writableState.errorEmitted = true;
    stream.emit('error', er);
    // this can emit finish, but finish must
    // always follow error
    finishMaybe(stream, state);
  }
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er) onwriteError(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state);

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      /*<replacement>*/
      asyncWrite(afterWrite, stream, state, finished, cb);
      /*</replacement>*/
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished) onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}

// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;

    var count = 0;
    var allBuffers = true;
    while (entry) {
      buffer[count] = entry;
      if (!entry.isBuf) allBuffers = false;
      entry = entry.next;
      count += 1;
    }
    buffer.allBuffers = allBuffers;

    doWrite(stream, state, true, state.length, buffer, '', holder.finish);

    // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite
    state.pendingcb++;
    state.lastBufferedRequest = null;
    if (holder.next) {
      state.corkedRequestsFree = holder.next;
      holder.next = null;
    } else {
      state.corkedRequestsFree = new CorkedRequest(state);
    }
    state.bufferedRequestCount = 0;
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      state.bufferedRequestCount--;
      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function (chunk, encoding, cb) {
  cb(new Error('_write() is not implemented'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished) endWritable(this, state, cb);
};

function needFinish(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}
function callFinal(stream, state) {
  stream._final(function (err) {
    state.pendingcb--;
    if (err) {
      stream.emit('error', err);
    }
    state.prefinished = true;
    stream.emit('prefinish');
    finishMaybe(stream, state);
  });
}
function prefinish(stream, state) {
  if (!state.prefinished && !state.finalCalled) {
    if (typeof stream._final === 'function') {
      state.pendingcb++;
      state.finalCalled = true;
      pna.nextTick(callFinal, stream, state);
    } else {
      state.prefinished = true;
      stream.emit('prefinish');
    }
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);
  if (need) {
    prefinish(stream, state);
    if (state.pendingcb === 0) {
      state.finished = true;
      stream.emit('finish');
    }
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished) pna.nextTick(cb);else stream.once('finish', cb);
  }
  state.ended = true;
  stream.writable = false;
}

function onCorkedFinish(corkReq, state, err) {
  var entry = corkReq.entry;
  corkReq.entry = null;
  while (entry) {
    var cb = entry.callback;
    state.pendingcb--;
    cb(err);
    entry = entry.next;
  }
  if (state.corkedRequestsFree) {
    state.corkedRequestsFree.next = corkReq;
  } else {
    state.corkedRequestsFree = corkReq;
  }
}

Object.defineProperty(Writable.prototype, 'destroyed', {
  get: function get() {
    if (this._writableState === undefined) {
      return false;
    }
    return this._writableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._writableState) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._writableState.destroyed = value;
  }
});

Writable.prototype.destroy = destroyImpl.destroy;
Writable.prototype._undestroy = destroyImpl.undestroy;
Writable.prototype._destroy = function (err, cb) {
  this.end();
  cb(err);
};

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("timers").setImmediate)
},{"./_stream_duplex":576,"./internal/streams/destroy":582,"./internal/streams/stream":583,"_process":572,"core-util-is":552,"inherits":565,"process-nextick-args":571,"safe-buffer":591,"timers":602,"util-deprecate":610}],581:[function(require,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
}

var Buffer = require('safe-buffer').Buffer;
var util = require('util');

function copyBuffer(src, target, offset) {
  src.copy(target, offset);
}

module.exports = function () {
  function BufferList() {
    _classCallCheck(this, BufferList);

    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  BufferList.prototype.push = function push(v) {
    var entry = { data: v, next: null };
    if (this.length > 0) this.tail.next = entry;else this.head = entry;
    this.tail = entry;
    ++this.length;
  };

  BufferList.prototype.unshift = function unshift(v) {
    var entry = { data: v, next: this.head };
    if (this.length === 0) this.tail = entry;
    this.head = entry;
    ++this.length;
  };

  BufferList.prototype.shift = function shift() {
    if (this.length === 0) return;
    var ret = this.head.data;
    if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
    --this.length;
    return ret;
  };

  BufferList.prototype.clear = function clear() {
    this.head = this.tail = null;
    this.length = 0;
  };

  BufferList.prototype.join = function join(s) {
    if (this.length === 0) return '';
    var p = this.head;
    var ret = '' + p.data;
    while (p = p.next) {
      ret += s + p.data;
    }return ret;
  };

  BufferList.prototype.concat = function concat(n) {
    if (this.length === 0) return Buffer.alloc(0);
    if (this.length === 1) return this.head.data;
    var ret = Buffer.allocUnsafe(n >>> 0);
    var p = this.head;
    var i = 0;
    while (p) {
      copyBuffer(p.data, ret, i);
      i += p.data.length;
      p = p.next;
    }
    return ret;
  };

  return BufferList;
}();

if (util && util.inspect && util.inspect.custom) {
  module.exports.prototype[util.inspect.custom] = function () {
    var obj = util.inspect({ length: this.length });
    return this.constructor.name + ' ' + obj;
  };
}

},{"safe-buffer":591,"util":117}],582:[function(require,module,exports){
'use strict';

/*<replacement>*/

var pna = require('process-nextick-args');
/*</replacement>*/

// undocumented cb() API, needed for core, not for public API
function destroy(err, cb) {
  var _this = this;

  var readableDestroyed = this._readableState && this._readableState.destroyed;
  var writableDestroyed = this._writableState && this._writableState.destroyed;

  if (readableDestroyed || writableDestroyed) {
    if (cb) {
      cb(err);
    } else if (err && (!this._writableState || !this._writableState.errorEmitted)) {
      pna.nextTick(emitErrorNT, this, err);
    }
    return this;
  }

  // we set destroyed to true before firing error callbacks in order
  // to make it re-entrance safe in case destroy() is called within callbacks

  if (this._readableState) {
    this._readableState.destroyed = true;
  }

  // if this is a duplex stream mark the writable part as destroyed as well
  if (this._writableState) {
    this._writableState.destroyed = true;
  }

  this._destroy(err || null, function (err) {
    if (!cb && err) {
      pna.nextTick(emitErrorNT, _this, err);
      if (_this._writableState) {
        _this._writableState.errorEmitted = true;
      }
    } else if (cb) {
      cb(err);
    }
  });

  return this;
}

function undestroy() {
  if (this._readableState) {
    this._readableState.destroyed = false;
    this._readableState.reading = false;
    this._readableState.ended = false;
    this._readableState.endEmitted = false;
  }

  if (this._writableState) {
    this._writableState.destroyed = false;
    this._writableState.ended = false;
    this._writableState.ending = false;
    this._writableState.finished = false;
    this._writableState.errorEmitted = false;
  }
}

function emitErrorNT(self, err) {
  self.emit('error', err);
}

module.exports = {
  destroy: destroy,
  undestroy: undestroy
};

},{"process-nextick-args":571}],583:[function(require,module,exports){
'use strict';

module.exports = require('events').EventEmitter;

},{"events":562}],584:[function(require,module,exports){
'use strict';

module.exports = require('./readable').PassThrough;

},{"./readable":585}],585:[function(require,module,exports){
'use strict';

exports = module.exports = require('./lib/_stream_readable.js');
exports.Stream = exports;
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');

},{"./lib/_stream_duplex.js":576,"./lib/_stream_passthrough.js":577,"./lib/_stream_readable.js":578,"./lib/_stream_transform.js":579,"./lib/_stream_writable.js":580}],586:[function(require,module,exports){
'use strict';

module.exports = require('./readable').Transform;

},{"./readable":585}],587:[function(require,module,exports){
'use strict';

module.exports = require('./lib/_stream_writable.js');

},{"./lib/_stream_writable.js":580}],588:[function(require,module,exports){
"use strict";

/**
 * Copyright (c) 2014-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// This method of obtaining a reference to the global object needs to be
// kept identical to the way it is obtained in runtime.js
var g = function () {
  return this;
}() || Function("return this")();

// Use `getOwnPropertyNames` because not all browsers support calling
// `hasOwnProperty` on the global `self` object in a worker. See #183.
var hadRuntime = g.regeneratorRuntime && Object.getOwnPropertyNames(g).indexOf("regeneratorRuntime") >= 0;

// Save the old regeneratorRuntime in case it needs to be restored later.
var oldRuntime = hadRuntime && g.regeneratorRuntime;

// Force reevalutation of runtime.js.
g.regeneratorRuntime = undefined;

module.exports = require("./runtime");

if (hadRuntime) {
  // Restore the original runtime.
  g.regeneratorRuntime = oldRuntime;
} else {
  // Remove the global property added by runtime.js.
  try {
    delete g.regeneratorRuntime;
  } catch (e) {
    g.regeneratorRuntime = undefined;
  }
}

},{"./runtime":589}],589:[function(require,module,exports){
"use strict";

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/**
 * Copyright (c) 2014-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

!function (global) {
  "use strict";

  var Op = Object.prototype;
  var hasOwn = Op.hasOwnProperty;
  var undefined; // More compressible than void 0.
  var $Symbol = typeof Symbol === "function" ? Symbol : {};
  var iteratorSymbol = $Symbol.iterator || "@@iterator";
  var asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator";
  var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";

  var inModule = (typeof module === "undefined" ? "undefined" : _typeof(module)) === "object";
  var runtime = global.regeneratorRuntime;
  if (runtime) {
    if (inModule) {
      // If regeneratorRuntime is defined globally and we're in a module,
      // make the exports object identical to regeneratorRuntime.
      module.exports = runtime;
    }
    // Don't bother evaluating the rest of this file if the runtime was
    // already defined globally.
    return;
  }

  // Define the runtime globally (as expected by generated code) as either
  // module.exports (if we're in a module) or a new, empty object.
  runtime = global.regeneratorRuntime = inModule ? module.exports : {};

  function wrap(innerFn, outerFn, self, tryLocsList) {
    // If outerFn provided and outerFn.prototype is a Generator, then outerFn.prototype instanceof Generator.
    var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
    var generator = Object.create(protoGenerator.prototype);
    var context = new Context(tryLocsList || []);

    // The ._invoke method unifies the implementations of the .next,
    // .throw, and .return methods.
    generator._invoke = makeInvokeMethod(innerFn, self, context);

    return generator;
  }
  runtime.wrap = wrap;

  // Try/catch helper to minimize deoptimizations. Returns a completion
  // record like context.tryEntries[i].completion. This interface could
  // have been (and was previously) designed to take a closure to be
  // invoked without arguments, but in all the cases we care about we
  // already have an existing method we want to call, so there's no need
  // to create a new function object. We can even get away with assuming
  // the method takes exactly one argument, since that happens to be true
  // in every case, so we don't have to touch the arguments object. The
  // only additional allocation required is the completion record, which
  // has a stable shape and so hopefully should be cheap to allocate.
  function tryCatch(fn, obj, arg) {
    try {
      return { type: "normal", arg: fn.call(obj, arg) };
    } catch (err) {
      return { type: "throw", arg: err };
    }
  }

  var GenStateSuspendedStart = "suspendedStart";
  var GenStateSuspendedYield = "suspendedYield";
  var GenStateExecuting = "executing";
  var GenStateCompleted = "completed";

  // Returning this object from the innerFn has the same effect as
  // breaking out of the dispatch switch statement.
  var ContinueSentinel = {};

  // Dummy constructor functions that we use as the .constructor and
  // .constructor.prototype properties for functions that return Generator
  // objects. For full spec compliance, you may wish to configure your
  // minifier not to mangle the names of these two functions.
  function Generator() {}
  function GeneratorFunction() {}
  function GeneratorFunctionPrototype() {}

  // This is a polyfill for %IteratorPrototype% for environments that
  // don't natively support it.
  var IteratorPrototype = {};
  IteratorPrototype[iteratorSymbol] = function () {
    return this;
  };

  var getProto = Object.getPrototypeOf;
  var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
  if (NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol)) {
    // This environment has a native %IteratorPrototype%; use it instead
    // of the polyfill.
    IteratorPrototype = NativeIteratorPrototype;
  }

  var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype);
  GeneratorFunction.prototype = Gp.constructor = GeneratorFunctionPrototype;
  GeneratorFunctionPrototype.constructor = GeneratorFunction;
  GeneratorFunctionPrototype[toStringTagSymbol] = GeneratorFunction.displayName = "GeneratorFunction";

  // Helper for defining the .next, .throw, and .return methods of the
  // Iterator interface in terms of a single ._invoke method.
  function defineIteratorMethods(prototype) {
    ["next", "throw", "return"].forEach(function (method) {
      prototype[method] = function (arg) {
        return this._invoke(method, arg);
      };
    });
  }

  runtime.isGeneratorFunction = function (genFun) {
    var ctor = typeof genFun === "function" && genFun.constructor;
    return ctor ? ctor === GeneratorFunction ||
    // For the native GeneratorFunction constructor, the best we can
    // do is to check its .name property.
    (ctor.displayName || ctor.name) === "GeneratorFunction" : false;
  };

  runtime.mark = function (genFun) {
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
    } else {
      genFun.__proto__ = GeneratorFunctionPrototype;
      if (!(toStringTagSymbol in genFun)) {
        genFun[toStringTagSymbol] = "GeneratorFunction";
      }
    }
    genFun.prototype = Object.create(Gp);
    return genFun;
  };

  // Within the body of any async function, `await x` is transformed to
  // `yield regeneratorRuntime.awrap(x)`, so that the runtime can test
  // `hasOwn.call(value, "__await")` to determine if the yielded value is
  // meant to be awaited.
  runtime.awrap = function (arg) {
    return { __await: arg };
  };

  function AsyncIterator(generator) {
    function invoke(method, arg, resolve, reject) {
      var record = tryCatch(generator[method], generator, arg);
      if (record.type === "throw") {
        reject(record.arg);
      } else {
        var result = record.arg;
        var value = result.value;
        if (value && (typeof value === "undefined" ? "undefined" : _typeof(value)) === "object" && hasOwn.call(value, "__await")) {
          return Promise.resolve(value.__await).then(function (value) {
            invoke("next", value, resolve, reject);
          }, function (err) {
            invoke("throw", err, resolve, reject);
          });
        }

        return Promise.resolve(value).then(function (unwrapped) {
          // When a yielded Promise is resolved, its final value becomes
          // the .value of the Promise<{value,done}> result for the
          // current iteration. If the Promise is rejected, however, the
          // result for this iteration will be rejected with the same
          // reason. Note that rejections of yielded Promises are not
          // thrown back into the generator function, as is the case
          // when an awaited Promise is rejected. This difference in
          // behavior between yield and await is important, because it
          // allows the consumer to decide what to do with the yielded
          // rejection (swallow it and continue, manually .throw it back
          // into the generator, abandon iteration, whatever). With
          // await, by contrast, there is no opportunity to examine the
          // rejection reason outside the generator function, so the
          // only option is to throw it from the await expression, and
          // let the generator function handle the exception.
          result.value = unwrapped;
          resolve(result);
        }, reject);
      }
    }

    var previousPromise;

    function enqueue(method, arg) {
      function callInvokeWithMethodAndArg() {
        return new Promise(function (resolve, reject) {
          invoke(method, arg, resolve, reject);
        });
      }

      return previousPromise =
      // If enqueue has been called before, then we want to wait until
      // all previous Promises have been resolved before calling invoke,
      // so that results are always delivered in the correct order. If
      // enqueue has not been called before, then it is important to
      // call invoke immediately, without waiting on a callback to fire,
      // so that the async generator function has the opportunity to do
      // any necessary setup in a predictable way. This predictability
      // is why the Promise constructor synchronously invokes its
      // executor callback, and why async functions synchronously
      // execute code before the first await. Since we implement simple
      // async functions in terms of async generators, it is especially
      // important to get this right, even though it requires care.
      previousPromise ? previousPromise.then(callInvokeWithMethodAndArg,
      // Avoid propagating failures to Promises returned by later
      // invocations of the iterator.
      callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg();
    }

    // Define the unified helper method that is used to implement .next,
    // .throw, and .return (see defineIteratorMethods).
    this._invoke = enqueue;
  }

  defineIteratorMethods(AsyncIterator.prototype);
  AsyncIterator.prototype[asyncIteratorSymbol] = function () {
    return this;
  };
  runtime.AsyncIterator = AsyncIterator;

  // Note that simple async functions are implemented on top of
  // AsyncIterator objects; they just return a Promise for the value of
  // the final result produced by the iterator.
  runtime.async = function (innerFn, outerFn, self, tryLocsList) {
    var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList));

    return runtime.isGeneratorFunction(outerFn) ? iter // If outerFn is a generator, return the full iterator.
    : iter.next().then(function (result) {
      return result.done ? result.value : iter.next();
    });
  };

  function makeInvokeMethod(innerFn, self, context) {
    var state = GenStateSuspendedStart;

    return function invoke(method, arg) {
      if (state === GenStateExecuting) {
        throw new Error("Generator is already running");
      }

      if (state === GenStateCompleted) {
        if (method === "throw") {
          throw arg;
        }

        // Be forgiving, per 25.3.3.3.3 of the spec:
        // https://people.mozilla.org/~jorendorff/es6-draft.html#sec-generatorresume
        return doneResult();
      }

      context.method = method;
      context.arg = arg;

      while (true) {
        var delegate = context.delegate;
        if (delegate) {
          var delegateResult = maybeInvokeDelegate(delegate, context);
          if (delegateResult) {
            if (delegateResult === ContinueSentinel) continue;
            return delegateResult;
          }
        }

        if (context.method === "next") {
          // Setting context._sent for legacy support of Babel's
          // function.sent implementation.
          context.sent = context._sent = context.arg;
        } else if (context.method === "throw") {
          if (state === GenStateSuspendedStart) {
            state = GenStateCompleted;
            throw context.arg;
          }

          context.dispatchException(context.arg);
        } else if (context.method === "return") {
          context.abrupt("return", context.arg);
        }

        state = GenStateExecuting;

        var record = tryCatch(innerFn, self, context);
        if (record.type === "normal") {
          // If an exception is thrown from innerFn, we leave state ===
          // GenStateExecuting and loop back for another invocation.
          state = context.done ? GenStateCompleted : GenStateSuspendedYield;

          if (record.arg === ContinueSentinel) {
            continue;
          }

          return {
            value: record.arg,
            done: context.done
          };
        } else if (record.type === "throw") {
          state = GenStateCompleted;
          // Dispatch the exception by looping back around to the
          // context.dispatchException(context.arg) call above.
          context.method = "throw";
          context.arg = record.arg;
        }
      }
    };
  }

  // Call delegate.iterator[context.method](context.arg) and handle the
  // result, either by returning a { value, done } result from the
  // delegate iterator, or by modifying context.method and context.arg,
  // setting context.delegate to null, and returning the ContinueSentinel.
  function maybeInvokeDelegate(delegate, context) {
    var method = delegate.iterator[context.method];
    if (method === undefined) {
      // A .throw or .return when the delegate iterator has no .throw
      // method always terminates the yield* loop.
      context.delegate = null;

      if (context.method === "throw") {
        if (delegate.iterator.return) {
          // If the delegate iterator has a return method, give it a
          // chance to clean up.
          context.method = "return";
          context.arg = undefined;
          maybeInvokeDelegate(delegate, context);

          if (context.method === "throw") {
            // If maybeInvokeDelegate(context) changed context.method from
            // "return" to "throw", let that override the TypeError below.
            return ContinueSentinel;
          }
        }

        context.method = "throw";
        context.arg = new TypeError("The iterator does not provide a 'throw' method");
      }

      return ContinueSentinel;
    }

    var record = tryCatch(method, delegate.iterator, context.arg);

    if (record.type === "throw") {
      context.method = "throw";
      context.arg = record.arg;
      context.delegate = null;
      return ContinueSentinel;
    }

    var info = record.arg;

    if (!info) {
      context.method = "throw";
      context.arg = new TypeError("iterator result is not an object");
      context.delegate = null;
      return ContinueSentinel;
    }

    if (info.done) {
      // Assign the result of the finished delegate to the temporary
      // variable specified by delegate.resultName (see delegateYield).
      context[delegate.resultName] = info.value;

      // Resume execution at the desired location (see delegateYield).
      context.next = delegate.nextLoc;

      // If context.method was "throw" but the delegate handled the
      // exception, let the outer generator proceed normally. If
      // context.method was "next", forget context.arg since it has been
      // "consumed" by the delegate iterator. If context.method was
      // "return", allow the original .return call to continue in the
      // outer generator.
      if (context.method !== "return") {
        context.method = "next";
        context.arg = undefined;
      }
    } else {
      // Re-yield the result returned by the delegate method.
      return info;
    }

    // The delegate iterator is finished, so forget it and continue with
    // the outer generator.
    context.delegate = null;
    return ContinueSentinel;
  }

  // Define Generator.prototype.{next,throw,return} in terms of the
  // unified ._invoke helper method.
  defineIteratorMethods(Gp);

  Gp[toStringTagSymbol] = "Generator";

  // A Generator should always return itself as the iterator object when the
  // @@iterator function is called on it. Some browsers' implementations of the
  // iterator prototype chain incorrectly implement this, causing the Generator
  // object to not be returned from this call. This ensures that doesn't happen.
  // See https://github.com/facebook/regenerator/issues/274 for more details.
  Gp[iteratorSymbol] = function () {
    return this;
  };

  Gp.toString = function () {
    return "[object Generator]";
  };

  function pushTryEntry(locs) {
    var entry = { tryLoc: locs[0] };

    if (1 in locs) {
      entry.catchLoc = locs[1];
    }

    if (2 in locs) {
      entry.finallyLoc = locs[2];
      entry.afterLoc = locs[3];
    }

    this.tryEntries.push(entry);
  }

  function resetTryEntry(entry) {
    var record = entry.completion || {};
    record.type = "normal";
    delete record.arg;
    entry.completion = record;
  }

  function Context(tryLocsList) {
    // The root entry object (effectively a try statement without a catch
    // or a finally block) gives us a place to store values thrown from
    // locations where there is no enclosing try statement.
    this.tryEntries = [{ tryLoc: "root" }];
    tryLocsList.forEach(pushTryEntry, this);
    this.reset(true);
  }

  runtime.keys = function (object) {
    var keys = [];
    for (var key in object) {
      keys.push(key);
    }
    keys.reverse();

    // Rather than returning an object with a next method, we keep
    // things simple and return the next function itself.
    return function next() {
      while (keys.length) {
        var key = keys.pop();
        if (key in object) {
          next.value = key;
          next.done = false;
          return next;
        }
      }

      // To avoid creating an additional object, we just hang the .value
      // and .done properties off the next function object itself. This
      // also ensures that the minifier will not anonymize the function.
      next.done = true;
      return next;
    };
  };

  function values(iterable) {
    if (iterable) {
      var iteratorMethod = iterable[iteratorSymbol];
      if (iteratorMethod) {
        return iteratorMethod.call(iterable);
      }

      if (typeof iterable.next === "function") {
        return iterable;
      }

      if (!isNaN(iterable.length)) {
        var i = -1,
            next = function next() {
          while (++i < iterable.length) {
            if (hasOwn.call(iterable, i)) {
              next.value = iterable[i];
              next.done = false;
              return next;
            }
          }

          next.value = undefined;
          next.done = true;

          return next;
        };

        return next.next = next;
      }
    }

    // Return an iterator with no values.
    return { next: doneResult };
  }
  runtime.values = values;

  function doneResult() {
    return { value: undefined, done: true };
  }

  Context.prototype = {
    constructor: Context,

    reset: function reset(skipTempReset) {
      this.prev = 0;
      this.next = 0;
      // Resetting context._sent for legacy support of Babel's
      // function.sent implementation.
      this.sent = this._sent = undefined;
      this.done = false;
      this.delegate = null;

      this.method = "next";
      this.arg = undefined;

      this.tryEntries.forEach(resetTryEntry);

      if (!skipTempReset) {
        for (var name in this) {
          // Not sure about the optimal order of these conditions:
          if (name.charAt(0) === "t" && hasOwn.call(this, name) && !isNaN(+name.slice(1))) {
            this[name] = undefined;
          }
        }
      }
    },

    stop: function stop() {
      this.done = true;

      var rootEntry = this.tryEntries[0];
      var rootRecord = rootEntry.completion;
      if (rootRecord.type === "throw") {
        throw rootRecord.arg;
      }

      return this.rval;
    },

    dispatchException: function dispatchException(exception) {
      if (this.done) {
        throw exception;
      }

      var context = this;
      function handle(loc, caught) {
        record.type = "throw";
        record.arg = exception;
        context.next = loc;

        if (caught) {
          // If the dispatched exception was caught by a catch block,
          // then let that catch block handle the exception normally.
          context.method = "next";
          context.arg = undefined;
        }

        return !!caught;
      }

      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        var record = entry.completion;

        if (entry.tryLoc === "root") {
          // Exception thrown outside of any try block that could handle
          // it, so set the completion value of the entire function to
          // throw the exception.
          return handle("end");
        }

        if (entry.tryLoc <= this.prev) {
          var hasCatch = hasOwn.call(entry, "catchLoc");
          var hasFinally = hasOwn.call(entry, "finallyLoc");

          if (hasCatch && hasFinally) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            } else if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }
          } else if (hasCatch) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            }
          } else if (hasFinally) {
            if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }
          } else {
            throw new Error("try statement without catch or finally");
          }
        }
      }
    },

    abrupt: function abrupt(type, arg) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) {
          var finallyEntry = entry;
          break;
        }
      }

      if (finallyEntry && (type === "break" || type === "continue") && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc) {
        // Ignore the finally entry if control is not jumping to a
        // location outside the try/catch block.
        finallyEntry = null;
      }

      var record = finallyEntry ? finallyEntry.completion : {};
      record.type = type;
      record.arg = arg;

      if (finallyEntry) {
        this.method = "next";
        this.next = finallyEntry.finallyLoc;
        return ContinueSentinel;
      }

      return this.complete(record);
    },

    complete: function complete(record, afterLoc) {
      if (record.type === "throw") {
        throw record.arg;
      }

      if (record.type === "break" || record.type === "continue") {
        this.next = record.arg;
      } else if (record.type === "return") {
        this.rval = this.arg = record.arg;
        this.method = "return";
        this.next = "end";
      } else if (record.type === "normal" && afterLoc) {
        this.next = afterLoc;
      }

      return ContinueSentinel;
    },

    finish: function finish(finallyLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.finallyLoc === finallyLoc) {
          this.complete(entry.completion, entry.afterLoc);
          resetTryEntry(entry);
          return ContinueSentinel;
        }
      }
    },

    "catch": function _catch(tryLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc === tryLoc) {
          var record = entry.completion;
          if (record.type === "throw") {
            var thrown = record.arg;
            resetTryEntry(entry);
          }
          return thrown;
        }
      }

      // The context.catch method must only be called with a location
      // argument that corresponds to a known catch block.
      throw new Error("illegal catch attempt");
    },

    delegateYield: function delegateYield(iterable, resultName, nextLoc) {
      this.delegate = {
        iterator: values(iterable),
        resultName: resultName,
        nextLoc: nextLoc
      };

      if (this.method === "next") {
        // Deliberately forget the last sent value so that we don't
        // accidentally pass it on to the delegate.
        this.arg = undefined;
      }

      return ContinueSentinel;
    }
  };
}(
// In sloppy mode, unbound `this` refers to the global object, fallback to
// Function constructor if we're in global strict mode. That is sadly a form
// of indirect eval which violates Content Security Policy.
function () {
  return this;
}() || Function("return this")());

},{}],590:[function(require,module,exports){
'use strict';

var Buffer = require('buffer').Buffer;
var inherits = require('inherits');
var HashBase = require('hash-base');

var ARRAY16 = new Array(16);

var zl = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13];

var zr = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11];

var sl = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6];

var sr = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11];

var hl = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
var hr = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

function RIPEMD160() {
  HashBase.call(this, 64);

  // state
  this._a = 0x67452301;
  this._b = 0xefcdab89;
  this._c = 0x98badcfe;
  this._d = 0x10325476;
  this._e = 0xc3d2e1f0;
}

inherits(RIPEMD160, HashBase);

RIPEMD160.prototype._update = function () {
  var words = ARRAY16;
  for (var j = 0; j < 16; ++j) {
    words[j] = this._block.readInt32LE(j * 4);
  }var al = this._a | 0;
  var bl = this._b | 0;
  var cl = this._c | 0;
  var dl = this._d | 0;
  var el = this._e | 0;

  var ar = this._a | 0;
  var br = this._b | 0;
  var cr = this._c | 0;
  var dr = this._d | 0;
  var er = this._e | 0;

  // computation
  for (var i = 0; i < 80; i += 1) {
    var tl;
    var tr;
    if (i < 16) {
      tl = fn1(al, bl, cl, dl, el, words[zl[i]], hl[0], sl[i]);
      tr = fn5(ar, br, cr, dr, er, words[zr[i]], hr[0], sr[i]);
    } else if (i < 32) {
      tl = fn2(al, bl, cl, dl, el, words[zl[i]], hl[1], sl[i]);
      tr = fn4(ar, br, cr, dr, er, words[zr[i]], hr[1], sr[i]);
    } else if (i < 48) {
      tl = fn3(al, bl, cl, dl, el, words[zl[i]], hl[2], sl[i]);
      tr = fn3(ar, br, cr, dr, er, words[zr[i]], hr[2], sr[i]);
    } else if (i < 64) {
      tl = fn4(al, bl, cl, dl, el, words[zl[i]], hl[3], sl[i]);
      tr = fn2(ar, br, cr, dr, er, words[zr[i]], hr[3], sr[i]);
    } else {
      // if (i<80) {
      tl = fn5(al, bl, cl, dl, el, words[zl[i]], hl[4], sl[i]);
      tr = fn1(ar, br, cr, dr, er, words[zr[i]], hr[4], sr[i]);
    }

    al = el;
    el = dl;
    dl = rotl(cl, 10);
    cl = bl;
    bl = tl;

    ar = er;
    er = dr;
    dr = rotl(cr, 10);
    cr = br;
    br = tr;
  }

  // update state
  var t = this._b + cl + dr | 0;
  this._b = this._c + dl + er | 0;
  this._c = this._d + el + ar | 0;
  this._d = this._e + al + br | 0;
  this._e = this._a + bl + cr | 0;
  this._a = t;
};

RIPEMD160.prototype._digest = function () {
  // create padding and handle blocks
  this._block[this._blockOffset++] = 0x80;
  if (this._blockOffset > 56) {
    this._block.fill(0, this._blockOffset, 64);
    this._update();
    this._blockOffset = 0;
  }

  this._block.fill(0, this._blockOffset, 56);
  this._block.writeUInt32LE(this._length[0], 56);
  this._block.writeUInt32LE(this._length[1], 60);
  this._update();

  // produce result
  var buffer = Buffer.alloc ? Buffer.alloc(20) : new Buffer(20);
  buffer.writeInt32LE(this._a, 0);
  buffer.writeInt32LE(this._b, 4);
  buffer.writeInt32LE(this._c, 8);
  buffer.writeInt32LE(this._d, 12);
  buffer.writeInt32LE(this._e, 16);
  return buffer;
};

function rotl(x, n) {
  return x << n | x >>> 32 - n;
}

function fn1(a, b, c, d, e, m, k, s) {
  return rotl(a + (b ^ c ^ d) + m + k | 0, s) + e | 0;
}

function fn2(a, b, c, d, e, m, k, s) {
  return rotl(a + (b & c | ~b & d) + m + k | 0, s) + e | 0;
}

function fn3(a, b, c, d, e, m, k, s) {
  return rotl(a + ((b | ~c) ^ d) + m + k | 0, s) + e | 0;
}

function fn4(a, b, c, d, e, m, k, s) {
  return rotl(a + (b & d | c & ~d) + m + k | 0, s) + e | 0;
}

function fn5(a, b, c, d, e, m, k, s) {
  return rotl(a + (b ^ (c | ~d)) + m + k | 0, s) + e | 0;
}

module.exports = RIPEMD160;

},{"buffer":121,"hash-base":563,"inherits":565}],591:[function(require,module,exports){
'use strict';

/* eslint-disable node/no-deprecated-api */
var buffer = require('buffer');
var Buffer = buffer.Buffer;

// alternative to using Object.keys for old browsers
function copyProps(src, dst) {
  for (var key in src) {
    dst[key] = src[key];
  }
}
if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
  module.exports = buffer;
} else {
  // Copy properties from require('buffer')
  copyProps(buffer, exports);
  exports.Buffer = SafeBuffer;
}

function SafeBuffer(arg, encodingOrOffset, length) {
  return Buffer(arg, encodingOrOffset, length);
}

// Copy static methods from Buffer
copyProps(Buffer, SafeBuffer);

SafeBuffer.from = function (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    throw new TypeError('Argument must not be a number');
  }
  return Buffer(arg, encodingOrOffset, length);
};

SafeBuffer.alloc = function (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number');
  }
  var buf = Buffer(size);
  if (fill !== undefined) {
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding);
    } else {
      buf.fill(fill);
    }
  } else {
    buf.fill(0);
  }
  return buf;
};

SafeBuffer.allocUnsafe = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number');
  }
  return Buffer(size);
};

SafeBuffer.allocUnsafeSlow = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number');
  }
  return buffer.SlowBuffer(size);
};

},{"buffer":121}],592:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;

// prototype class for hash functions
function Hash(blockSize, finalSize) {
  this._block = Buffer.alloc(blockSize);
  this._finalSize = finalSize;
  this._blockSize = blockSize;
  this._len = 0;
}

Hash.prototype.update = function (data, enc) {
  if (typeof data === 'string') {
    enc = enc || 'utf8';
    data = Buffer.from(data, enc);
  }

  var block = this._block;
  var blockSize = this._blockSize;
  var length = data.length;
  var accum = this._len;

  for (var offset = 0; offset < length;) {
    var assigned = accum % blockSize;
    var remainder = Math.min(length - offset, blockSize - assigned);

    for (var i = 0; i < remainder; i++) {
      block[assigned + i] = data[offset + i];
    }

    accum += remainder;
    offset += remainder;

    if (accum % blockSize === 0) {
      this._update(block);
    }
  }

  this._len += length;
  return this;
};

Hash.prototype.digest = function (enc) {
  var rem = this._len % this._blockSize;

  this._block[rem] = 0x80;

  // zero (rem + 1) trailing bits, where (rem + 1) is the smallest
  // non-negative solution to the equation (length + 1 + (rem + 1)) === finalSize mod blockSize
  this._block.fill(0, rem + 1);

  if (rem >= this._finalSize) {
    this._update(this._block);
    this._block.fill(0);
  }

  var bits = this._len * 8;

  // uint32
  if (bits <= 0xffffffff) {
    this._block.writeUInt32BE(bits, this._blockSize - 4);

    // uint64
  } else {
    var lowBits = (bits & 0xffffffff) >>> 0;
    var highBits = (bits - lowBits) / 0x100000000;

    this._block.writeUInt32BE(highBits, this._blockSize - 8);
    this._block.writeUInt32BE(lowBits, this._blockSize - 4);
  }

  this._update(this._block);
  var hash = this._hash();

  return enc ? hash.toString(enc) : hash;
};

Hash.prototype._update = function () {
  throw new Error('_update must be implemented by subclass');
};

module.exports = Hash;

},{"safe-buffer":591}],593:[function(require,module,exports){
'use strict';

var _exports = module.exports = function SHA(algorithm) {
  algorithm = algorithm.toLowerCase();

  var Algorithm = _exports[algorithm];
  if (!Algorithm) throw new Error(algorithm + ' is not supported (we accept pull requests)');

  return new Algorithm();
};

_exports.sha = require('./sha');
_exports.sha1 = require('./sha1');
_exports.sha224 = require('./sha224');
_exports.sha256 = require('./sha256');
_exports.sha384 = require('./sha384');
_exports.sha512 = require('./sha512');

},{"./sha":594,"./sha1":595,"./sha224":596,"./sha256":597,"./sha384":598,"./sha512":599}],594:[function(require,module,exports){
'use strict';

/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-0, as defined
 * in FIPS PUB 180-1
 * This source code is derived from sha1.js of the same repository.
 * The difference between SHA-0 and SHA-1 is just a bitwise rotate left
 * operation was added.
 */

var inherits = require('inherits');
var Hash = require('./hash');
var Buffer = require('safe-buffer').Buffer;

var K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc | 0, 0xca62c1d6 | 0];

var W = new Array(80);

function Sha() {
  this.init();
  this._w = W;

  Hash.call(this, 64, 56);
}

inherits(Sha, Hash);

Sha.prototype.init = function () {
  this._a = 0x67452301;
  this._b = 0xefcdab89;
  this._c = 0x98badcfe;
  this._d = 0x10325476;
  this._e = 0xc3d2e1f0;

  return this;
};

function rotl5(num) {
  return num << 5 | num >>> 27;
}

function rotl30(num) {
  return num << 30 | num >>> 2;
}

function ft(s, b, c, d) {
  if (s === 0) return b & c | ~b & d;
  if (s === 2) return b & c | b & d | c & d;
  return b ^ c ^ d;
}

Sha.prototype._update = function (M) {
  var W = this._w;

  var a = this._a | 0;
  var b = this._b | 0;
  var c = this._c | 0;
  var d = this._d | 0;
  var e = this._e | 0;

  for (var i = 0; i < 16; ++i) {
    W[i] = M.readInt32BE(i * 4);
  }for (; i < 80; ++i) {
    W[i] = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16];
  }for (var j = 0; j < 80; ++j) {
    var s = ~~(j / 20);
    var t = rotl5(a) + ft(s, b, c, d) + e + W[j] + K[s] | 0;

    e = d;
    d = c;
    c = rotl30(b);
    b = a;
    a = t;
  }

  this._a = a + this._a | 0;
  this._b = b + this._b | 0;
  this._c = c + this._c | 0;
  this._d = d + this._d | 0;
  this._e = e + this._e | 0;
};

Sha.prototype._hash = function () {
  var H = Buffer.allocUnsafe(20);

  H.writeInt32BE(this._a | 0, 0);
  H.writeInt32BE(this._b | 0, 4);
  H.writeInt32BE(this._c | 0, 8);
  H.writeInt32BE(this._d | 0, 12);
  H.writeInt32BE(this._e | 0, 16);

  return H;
};

module.exports = Sha;

},{"./hash":592,"inherits":565,"safe-buffer":591}],595:[function(require,module,exports){
'use strict';

/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS PUB 180-1
 * Version 2.1a Copyright Paul Johnston 2000 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

var inherits = require('inherits');
var Hash = require('./hash');
var Buffer = require('safe-buffer').Buffer;

var K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc | 0, 0xca62c1d6 | 0];

var W = new Array(80);

function Sha1() {
  this.init();
  this._w = W;

  Hash.call(this, 64, 56);
}

inherits(Sha1, Hash);

Sha1.prototype.init = function () {
  this._a = 0x67452301;
  this._b = 0xefcdab89;
  this._c = 0x98badcfe;
  this._d = 0x10325476;
  this._e = 0xc3d2e1f0;

  return this;
};

function rotl1(num) {
  return num << 1 | num >>> 31;
}

function rotl5(num) {
  return num << 5 | num >>> 27;
}

function rotl30(num) {
  return num << 30 | num >>> 2;
}

function ft(s, b, c, d) {
  if (s === 0) return b & c | ~b & d;
  if (s === 2) return b & c | b & d | c & d;
  return b ^ c ^ d;
}

Sha1.prototype._update = function (M) {
  var W = this._w;

  var a = this._a | 0;
  var b = this._b | 0;
  var c = this._c | 0;
  var d = this._d | 0;
  var e = this._e | 0;

  for (var i = 0; i < 16; ++i) {
    W[i] = M.readInt32BE(i * 4);
  }for (; i < 80; ++i) {
    W[i] = rotl1(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16]);
  }for (var j = 0; j < 80; ++j) {
    var s = ~~(j / 20);
    var t = rotl5(a) + ft(s, b, c, d) + e + W[j] + K[s] | 0;

    e = d;
    d = c;
    c = rotl30(b);
    b = a;
    a = t;
  }

  this._a = a + this._a | 0;
  this._b = b + this._b | 0;
  this._c = c + this._c | 0;
  this._d = d + this._d | 0;
  this._e = e + this._e | 0;
};

Sha1.prototype._hash = function () {
  var H = Buffer.allocUnsafe(20);

  H.writeInt32BE(this._a | 0, 0);
  H.writeInt32BE(this._b | 0, 4);
  H.writeInt32BE(this._c | 0, 8);
  H.writeInt32BE(this._d | 0, 12);
  H.writeInt32BE(this._e | 0, 16);

  return H;
};

module.exports = Sha1;

},{"./hash":592,"inherits":565,"safe-buffer":591}],596:[function(require,module,exports){
'use strict';

/**
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-256, as defined
 * in FIPS 180-2
 * Version 2.2-beta Copyright Angel Marin, Paul Johnston 2000 - 2009.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 *
 */

var inherits = require('inherits');
var Sha256 = require('./sha256');
var Hash = require('./hash');
var Buffer = require('safe-buffer').Buffer;

var W = new Array(64);

function Sha224() {
  this.init();

  this._w = W; // new Array(64)

  Hash.call(this, 64, 56);
}

inherits(Sha224, Sha256);

Sha224.prototype.init = function () {
  this._a = 0xc1059ed8;
  this._b = 0x367cd507;
  this._c = 0x3070dd17;
  this._d = 0xf70e5939;
  this._e = 0xffc00b31;
  this._f = 0x68581511;
  this._g = 0x64f98fa7;
  this._h = 0xbefa4fa4;

  return this;
};

Sha224.prototype._hash = function () {
  var H = Buffer.allocUnsafe(28);

  H.writeInt32BE(this._a, 0);
  H.writeInt32BE(this._b, 4);
  H.writeInt32BE(this._c, 8);
  H.writeInt32BE(this._d, 12);
  H.writeInt32BE(this._e, 16);
  H.writeInt32BE(this._f, 20);
  H.writeInt32BE(this._g, 24);

  return H;
};

module.exports = Sha224;

},{"./hash":592,"./sha256":597,"inherits":565,"safe-buffer":591}],597:[function(require,module,exports){
'use strict';

/**
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-256, as defined
 * in FIPS 180-2
 * Version 2.2-beta Copyright Angel Marin, Paul Johnston 2000 - 2009.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 *
 */

var inherits = require('inherits');
var Hash = require('./hash');
var Buffer = require('safe-buffer').Buffer;

var K = [0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5, 0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174, 0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA, 0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967, 0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85, 0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070, 0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3, 0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2];

var W = new Array(64);

function Sha256() {
  this.init();

  this._w = W; // new Array(64)

  Hash.call(this, 64, 56);
}

inherits(Sha256, Hash);

Sha256.prototype.init = function () {
  this._a = 0x6a09e667;
  this._b = 0xbb67ae85;
  this._c = 0x3c6ef372;
  this._d = 0xa54ff53a;
  this._e = 0x510e527f;
  this._f = 0x9b05688c;
  this._g = 0x1f83d9ab;
  this._h = 0x5be0cd19;

  return this;
};

function ch(x, y, z) {
  return z ^ x & (y ^ z);
}

function maj(x, y, z) {
  return x & y | z & (x | y);
}

function sigma0(x) {
  return (x >>> 2 | x << 30) ^ (x >>> 13 | x << 19) ^ (x >>> 22 | x << 10);
}

function sigma1(x) {
  return (x >>> 6 | x << 26) ^ (x >>> 11 | x << 21) ^ (x >>> 25 | x << 7);
}

function gamma0(x) {
  return (x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ x >>> 3;
}

function gamma1(x) {
  return (x >>> 17 | x << 15) ^ (x >>> 19 | x << 13) ^ x >>> 10;
}

Sha256.prototype._update = function (M) {
  var W = this._w;

  var a = this._a | 0;
  var b = this._b | 0;
  var c = this._c | 0;
  var d = this._d | 0;
  var e = this._e | 0;
  var f = this._f | 0;
  var g = this._g | 0;
  var h = this._h | 0;

  for (var i = 0; i < 16; ++i) {
    W[i] = M.readInt32BE(i * 4);
  }for (; i < 64; ++i) {
    W[i] = gamma1(W[i - 2]) + W[i - 7] + gamma0(W[i - 15]) + W[i - 16] | 0;
  }for (var j = 0; j < 64; ++j) {
    var T1 = h + sigma1(e) + ch(e, f, g) + K[j] + W[j] | 0;
    var T2 = sigma0(a) + maj(a, b, c) | 0;

    h = g;
    g = f;
    f = e;
    e = d + T1 | 0;
    d = c;
    c = b;
    b = a;
    a = T1 + T2 | 0;
  }

  this._a = a + this._a | 0;
  this._b = b + this._b | 0;
  this._c = c + this._c | 0;
  this._d = d + this._d | 0;
  this._e = e + this._e | 0;
  this._f = f + this._f | 0;
  this._g = g + this._g | 0;
  this._h = h + this._h | 0;
};

Sha256.prototype._hash = function () {
  var H = Buffer.allocUnsafe(32);

  H.writeInt32BE(this._a, 0);
  H.writeInt32BE(this._b, 4);
  H.writeInt32BE(this._c, 8);
  H.writeInt32BE(this._d, 12);
  H.writeInt32BE(this._e, 16);
  H.writeInt32BE(this._f, 20);
  H.writeInt32BE(this._g, 24);
  H.writeInt32BE(this._h, 28);

  return H;
};

module.exports = Sha256;

},{"./hash":592,"inherits":565,"safe-buffer":591}],598:[function(require,module,exports){
'use strict';

var inherits = require('inherits');
var SHA512 = require('./sha512');
var Hash = require('./hash');
var Buffer = require('safe-buffer').Buffer;

var W = new Array(160);

function Sha384() {
  this.init();
  this._w = W;

  Hash.call(this, 128, 112);
}

inherits(Sha384, SHA512);

Sha384.prototype.init = function () {
  this._ah = 0xcbbb9d5d;
  this._bh = 0x629a292a;
  this._ch = 0x9159015a;
  this._dh = 0x152fecd8;
  this._eh = 0x67332667;
  this._fh = 0x8eb44a87;
  this._gh = 0xdb0c2e0d;
  this._hh = 0x47b5481d;

  this._al = 0xc1059ed8;
  this._bl = 0x367cd507;
  this._cl = 0x3070dd17;
  this._dl = 0xf70e5939;
  this._el = 0xffc00b31;
  this._fl = 0x68581511;
  this._gl = 0x64f98fa7;
  this._hl = 0xbefa4fa4;

  return this;
};

Sha384.prototype._hash = function () {
  var H = Buffer.allocUnsafe(48);

  function writeInt64BE(h, l, offset) {
    H.writeInt32BE(h, offset);
    H.writeInt32BE(l, offset + 4);
  }

  writeInt64BE(this._ah, this._al, 0);
  writeInt64BE(this._bh, this._bl, 8);
  writeInt64BE(this._ch, this._cl, 16);
  writeInt64BE(this._dh, this._dl, 24);
  writeInt64BE(this._eh, this._el, 32);
  writeInt64BE(this._fh, this._fl, 40);

  return H;
};

module.exports = Sha384;

},{"./hash":592,"./sha512":599,"inherits":565,"safe-buffer":591}],599:[function(require,module,exports){
'use strict';

var inherits = require('inherits');
var Hash = require('./hash');
var Buffer = require('safe-buffer').Buffer;

var K = [0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc, 0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118, 0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2, 0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1, 0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694, 0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3, 0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65, 0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5, 0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4, 0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725, 0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70, 0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df, 0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b, 0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30, 0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8, 0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53, 0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8, 0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb, 0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3, 0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec, 0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b, 0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178, 0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b, 0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c, 0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817];

var W = new Array(160);

function Sha512() {
  this.init();
  this._w = W;

  Hash.call(this, 128, 112);
}

inherits(Sha512, Hash);

Sha512.prototype.init = function () {
  this._ah = 0x6a09e667;
  this._bh = 0xbb67ae85;
  this._ch = 0x3c6ef372;
  this._dh = 0xa54ff53a;
  this._eh = 0x510e527f;
  this._fh = 0x9b05688c;
  this._gh = 0x1f83d9ab;
  this._hh = 0x5be0cd19;

  this._al = 0xf3bcc908;
  this._bl = 0x84caa73b;
  this._cl = 0xfe94f82b;
  this._dl = 0x5f1d36f1;
  this._el = 0xade682d1;
  this._fl = 0x2b3e6c1f;
  this._gl = 0xfb41bd6b;
  this._hl = 0x137e2179;

  return this;
};

function Ch(x, y, z) {
  return z ^ x & (y ^ z);
}

function maj(x, y, z) {
  return x & y | z & (x | y);
}

function sigma0(x, xl) {
  return (x >>> 28 | xl << 4) ^ (xl >>> 2 | x << 30) ^ (xl >>> 7 | x << 25);
}

function sigma1(x, xl) {
  return (x >>> 14 | xl << 18) ^ (x >>> 18 | xl << 14) ^ (xl >>> 9 | x << 23);
}

function Gamma0(x, xl) {
  return (x >>> 1 | xl << 31) ^ (x >>> 8 | xl << 24) ^ x >>> 7;
}

function Gamma0l(x, xl) {
  return (x >>> 1 | xl << 31) ^ (x >>> 8 | xl << 24) ^ (x >>> 7 | xl << 25);
}

function Gamma1(x, xl) {
  return (x >>> 19 | xl << 13) ^ (xl >>> 29 | x << 3) ^ x >>> 6;
}

function Gamma1l(x, xl) {
  return (x >>> 19 | xl << 13) ^ (xl >>> 29 | x << 3) ^ (x >>> 6 | xl << 26);
}

function getCarry(a, b) {
  return a >>> 0 < b >>> 0 ? 1 : 0;
}

Sha512.prototype._update = function (M) {
  var W = this._w;

  var ah = this._ah | 0;
  var bh = this._bh | 0;
  var ch = this._ch | 0;
  var dh = this._dh | 0;
  var eh = this._eh | 0;
  var fh = this._fh | 0;
  var gh = this._gh | 0;
  var hh = this._hh | 0;

  var al = this._al | 0;
  var bl = this._bl | 0;
  var cl = this._cl | 0;
  var dl = this._dl | 0;
  var el = this._el | 0;
  var fl = this._fl | 0;
  var gl = this._gl | 0;
  var hl = this._hl | 0;

  for (var i = 0; i < 32; i += 2) {
    W[i] = M.readInt32BE(i * 4);
    W[i + 1] = M.readInt32BE(i * 4 + 4);
  }
  for (; i < 160; i += 2) {
    var xh = W[i - 15 * 2];
    var xl = W[i - 15 * 2 + 1];
    var gamma0 = Gamma0(xh, xl);
    var gamma0l = Gamma0l(xl, xh);

    xh = W[i - 2 * 2];
    xl = W[i - 2 * 2 + 1];
    var gamma1 = Gamma1(xh, xl);
    var gamma1l = Gamma1l(xl, xh);

    // W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16]
    var Wi7h = W[i - 7 * 2];
    var Wi7l = W[i - 7 * 2 + 1];

    var Wi16h = W[i - 16 * 2];
    var Wi16l = W[i - 16 * 2 + 1];

    var Wil = gamma0l + Wi7l | 0;
    var Wih = gamma0 + Wi7h + getCarry(Wil, gamma0l) | 0;
    Wil = Wil + gamma1l | 0;
    Wih = Wih + gamma1 + getCarry(Wil, gamma1l) | 0;
    Wil = Wil + Wi16l | 0;
    Wih = Wih + Wi16h + getCarry(Wil, Wi16l) | 0;

    W[i] = Wih;
    W[i + 1] = Wil;
  }

  for (var j = 0; j < 160; j += 2) {
    Wih = W[j];
    Wil = W[j + 1];

    var majh = maj(ah, bh, ch);
    var majl = maj(al, bl, cl);

    var sigma0h = sigma0(ah, al);
    var sigma0l = sigma0(al, ah);
    var sigma1h = sigma1(eh, el);
    var sigma1l = sigma1(el, eh);

    // t1 = h + sigma1 + ch + K[j] + W[j]
    var Kih = K[j];
    var Kil = K[j + 1];

    var chh = Ch(eh, fh, gh);
    var chl = Ch(el, fl, gl);

    var t1l = hl + sigma1l | 0;
    var t1h = hh + sigma1h + getCarry(t1l, hl) | 0;
    t1l = t1l + chl | 0;
    t1h = t1h + chh + getCarry(t1l, chl) | 0;
    t1l = t1l + Kil | 0;
    t1h = t1h + Kih + getCarry(t1l, Kil) | 0;
    t1l = t1l + Wil | 0;
    t1h = t1h + Wih + getCarry(t1l, Wil) | 0;

    // t2 = sigma0 + maj
    var t2l = sigma0l + majl | 0;
    var t2h = sigma0h + majh + getCarry(t2l, sigma0l) | 0;

    hh = gh;
    hl = gl;
    gh = fh;
    gl = fl;
    fh = eh;
    fl = el;
    el = dl + t1l | 0;
    eh = dh + t1h + getCarry(el, dl) | 0;
    dh = ch;
    dl = cl;
    ch = bh;
    cl = bl;
    bh = ah;
    bl = al;
    al = t1l + t2l | 0;
    ah = t1h + t2h + getCarry(al, t1l) | 0;
  }

  this._al = this._al + al | 0;
  this._bl = this._bl + bl | 0;
  this._cl = this._cl + cl | 0;
  this._dl = this._dl + dl | 0;
  this._el = this._el + el | 0;
  this._fl = this._fl + fl | 0;
  this._gl = this._gl + gl | 0;
  this._hl = this._hl + hl | 0;

  this._ah = this._ah + ah + getCarry(this._al, al) | 0;
  this._bh = this._bh + bh + getCarry(this._bl, bl) | 0;
  this._ch = this._ch + ch + getCarry(this._cl, cl) | 0;
  this._dh = this._dh + dh + getCarry(this._dl, dl) | 0;
  this._eh = this._eh + eh + getCarry(this._el, el) | 0;
  this._fh = this._fh + fh + getCarry(this._fl, fl) | 0;
  this._gh = this._gh + gh + getCarry(this._gl, gl) | 0;
  this._hh = this._hh + hh + getCarry(this._hl, hl) | 0;
};

Sha512.prototype._hash = function () {
  var H = Buffer.allocUnsafe(64);

  function writeInt64BE(h, l, offset) {
    H.writeInt32BE(h, offset);
    H.writeInt32BE(l, offset + 4);
  }

  writeInt64BE(this._ah, this._al, 0);
  writeInt64BE(this._bh, this._bl, 8);
  writeInt64BE(this._ch, this._cl, 16);
  writeInt64BE(this._dh, this._dl, 24);
  writeInt64BE(this._eh, this._el, 32);
  writeInt64BE(this._fh, this._fl, 40);
  writeInt64BE(this._gh, this._gl, 48);
  writeInt64BE(this._hh, this._hl, 56);

  return H;
};

module.exports = Sha512;

},{"./hash":592,"inherits":565,"safe-buffer":591}],600:[function(require,module,exports){
'use strict';

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('readable-stream/readable.js');
Stream.Writable = require('readable-stream/writable.js');
Stream.Duplex = require('readable-stream/duplex.js');
Stream.Transform = require('readable-stream/transform.js');
Stream.PassThrough = require('readable-stream/passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;

// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function (dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }

  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"events":562,"inherits":565,"readable-stream/duplex.js":575,"readable-stream/passthrough.js":584,"readable-stream/readable.js":585,"readable-stream/transform.js":586,"readable-stream/writable.js":587}],601:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

/*<replacement>*/

var Buffer = require('safe-buffer').Buffer;
/*</replacement>*/

var isEncoding = Buffer.isEncoding || function (encoding) {
  encoding = '' + encoding;
  switch (encoding && encoding.toLowerCase()) {
    case 'hex':case 'utf8':case 'utf-8':case 'ascii':case 'binary':case 'base64':case 'ucs2':case 'ucs-2':case 'utf16le':case 'utf-16le':case 'raw':
      return true;
    default:
      return false;
  }
};

function _normalizeEncoding(enc) {
  if (!enc) return 'utf8';
  var retried;
  while (true) {
    switch (enc) {
      case 'utf8':
      case 'utf-8':
        return 'utf8';
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return 'utf16le';
      case 'latin1':
      case 'binary':
        return 'latin1';
      case 'base64':
      case 'ascii':
      case 'hex':
        return enc;
      default:
        if (retried) return; // undefined
        enc = ('' + enc).toLowerCase();
        retried = true;
    }
  }
};

// Do not cache `Buffer.isEncoding` when checking encoding names as some
// modules monkey-patch it to support additional encodings
function normalizeEncoding(enc) {
  var nenc = _normalizeEncoding(enc);
  if (typeof nenc !== 'string' && (Buffer.isEncoding === isEncoding || !isEncoding(enc))) throw new Error('Unknown encoding: ' + enc);
  return nenc || enc;
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters.
exports.StringDecoder = StringDecoder;
function StringDecoder(encoding) {
  this.encoding = normalizeEncoding(encoding);
  var nb;
  switch (this.encoding) {
    case 'utf16le':
      this.text = utf16Text;
      this.end = utf16End;
      nb = 4;
      break;
    case 'utf8':
      this.fillLast = utf8FillLast;
      nb = 4;
      break;
    case 'base64':
      this.text = base64Text;
      this.end = base64End;
      nb = 3;
      break;
    default:
      this.write = simpleWrite;
      this.end = simpleEnd;
      return;
  }
  this.lastNeed = 0;
  this.lastTotal = 0;
  this.lastChar = Buffer.allocUnsafe(nb);
}

StringDecoder.prototype.write = function (buf) {
  if (buf.length === 0) return '';
  var r;
  var i;
  if (this.lastNeed) {
    r = this.fillLast(buf);
    if (r === undefined) return '';
    i = this.lastNeed;
    this.lastNeed = 0;
  } else {
    i = 0;
  }
  if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
  return r || '';
};

StringDecoder.prototype.end = utf8End;

// Returns only complete characters in a Buffer
StringDecoder.prototype.text = utf8Text;

// Attempts to complete a partial non-UTF-8 character using bytes from a Buffer
StringDecoder.prototype.fillLast = function (buf) {
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
  this.lastNeed -= buf.length;
};

// Checks the type of a UTF-8 byte, whether it's ASCII, a leading byte, or a
// continuation byte. If an invalid byte is detected, -2 is returned.
function utf8CheckByte(byte) {
  if (byte <= 0x7F) return 0;else if (byte >> 5 === 0x06) return 2;else if (byte >> 4 === 0x0E) return 3;else if (byte >> 3 === 0x1E) return 4;
  return byte >> 6 === 0x02 ? -1 : -2;
}

// Checks at most 3 bytes at the end of a Buffer in order to detect an
// incomplete multi-byte UTF-8 character. The total number of bytes (2, 3, or 4)
// needed to complete the UTF-8 character (if applicable) are returned.
function utf8CheckIncomplete(self, buf, i) {
  var j = buf.length - 1;
  if (j < i) return 0;
  var nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 1;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 2;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) {
      if (nb === 2) nb = 0;else self.lastNeed = nb - 3;
    }
    return nb;
  }
  return 0;
}

// Validates as many continuation bytes for a multi-byte UTF-8 character as
// needed or are available. If we see a non-continuation byte where we expect
// one, we "replace" the validated continuation bytes we've seen so far with
// a single UTF-8 replacement character ('\ufffd'), to match v8's UTF-8 decoding
// behavior. The continuation byte check is included three times in the case
// where all of the continuation bytes for a character exist in the same buffer.
// It is also done this way as a slight performance increase instead of using a
// loop.
function utf8CheckExtraBytes(self, buf, p) {
  if ((buf[0] & 0xC0) !== 0x80) {
    self.lastNeed = 0;
    return '\uFFFD';
  }
  if (self.lastNeed > 1 && buf.length > 1) {
    if ((buf[1] & 0xC0) !== 0x80) {
      self.lastNeed = 1;
      return '\uFFFD';
    }
    if (self.lastNeed > 2 && buf.length > 2) {
      if ((buf[2] & 0xC0) !== 0x80) {
        self.lastNeed = 2;
        return '\uFFFD';
      }
    }
  }
}

// Attempts to complete a multi-byte UTF-8 character using bytes from a Buffer.
function utf8FillLast(buf) {
  var p = this.lastTotal - this.lastNeed;
  var r = utf8CheckExtraBytes(this, buf, p);
  if (r !== undefined) return r;
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, p, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, p, 0, buf.length);
  this.lastNeed -= buf.length;
}

// Returns all complete UTF-8 characters in a Buffer. If the Buffer ended on a
// partial character, the character's bytes are buffered until the required
// number of bytes are available.
function utf8Text(buf, i) {
  var total = utf8CheckIncomplete(this, buf, i);
  if (!this.lastNeed) return buf.toString('utf8', i);
  this.lastTotal = total;
  var end = buf.length - (total - this.lastNeed);
  buf.copy(this.lastChar, 0, end);
  return buf.toString('utf8', i, end);
}

// For UTF-8, a replacement character is added when ending on a partial
// character.
function utf8End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + '\uFFFD';
  return r;
}

// UTF-16LE typically needs two bytes per character, but even if we have an even
// number of bytes available, we need to check if we end on a leading/high
// surrogate. In that case, we need to wait for the next two bytes in order to
// decode the last character properly.
function utf16Text(buf, i) {
  if ((buf.length - i) % 2 === 0) {
    var r = buf.toString('utf16le', i);
    if (r) {
      var c = r.charCodeAt(r.length - 1);
      if (c >= 0xD800 && c <= 0xDBFF) {
        this.lastNeed = 2;
        this.lastTotal = 4;
        this.lastChar[0] = buf[buf.length - 2];
        this.lastChar[1] = buf[buf.length - 1];
        return r.slice(0, -1);
      }
    }
    return r;
  }
  this.lastNeed = 1;
  this.lastTotal = 2;
  this.lastChar[0] = buf[buf.length - 1];
  return buf.toString('utf16le', i, buf.length - 1);
}

// For UTF-16LE we do not explicitly append special replacement characters if we
// end on a partial character, we simply let v8 handle that.
function utf16End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) {
    var end = this.lastTotal - this.lastNeed;
    return r + this.lastChar.toString('utf16le', 0, end);
  }
  return r;
}

function base64Text(buf, i) {
  var n = (buf.length - i) % 3;
  if (n === 0) return buf.toString('base64', i);
  this.lastNeed = 3 - n;
  this.lastTotal = 3;
  if (n === 1) {
    this.lastChar[0] = buf[buf.length - 1];
  } else {
    this.lastChar[0] = buf[buf.length - 2];
    this.lastChar[1] = buf[buf.length - 1];
  }
  return buf.toString('base64', i, buf.length - n);
}

function base64End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + this.lastChar.toString('base64', 0, 3 - this.lastNeed);
  return r;
}

// Pass bytes on through for single-byte encodings (e.g. ascii, latin1, hex)
function simpleWrite(buf) {
  return buf.toString(this.encoding);
}

function simpleEnd(buf) {
  return buf && buf.length ? this.write(buf) : '';
}

},{"safe-buffer":591}],602:[function(require,module,exports){
(function (setImmediate,clearImmediate){
"use strict";

var nextTick = require('process/browser.js').nextTick;
var apply = Function.prototype.apply;
var slice = Array.prototype.slice;
var immediateIds = {};
var nextImmediateId = 0;

// DOM APIs, for completeness

exports.setTimeout = function () {
  return new Timeout(apply.call(setTimeout, window, arguments), clearTimeout);
};
exports.setInterval = function () {
  return new Timeout(apply.call(setInterval, window, arguments), clearInterval);
};
exports.clearTimeout = exports.clearInterval = function (timeout) {
  timeout.close();
};

function Timeout(id, clearFn) {
  this._id = id;
  this._clearFn = clearFn;
}
Timeout.prototype.unref = Timeout.prototype.ref = function () {};
Timeout.prototype.close = function () {
  this._clearFn.call(window, this._id);
};

// Does not start the time, just sets up the members needed.
exports.enroll = function (item, msecs) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = msecs;
};

exports.unenroll = function (item) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = -1;
};

exports._unrefActive = exports.active = function (item) {
  clearTimeout(item._idleTimeoutId);

  var msecs = item._idleTimeout;
  if (msecs >= 0) {
    item._idleTimeoutId = setTimeout(function onTimeout() {
      if (item._onTimeout) item._onTimeout();
    }, msecs);
  }
};

// That's not how node.js implements it but the exposed api is the same.
exports.setImmediate = typeof setImmediate === "function" ? setImmediate : function (fn) {
  var id = nextImmediateId++;
  var args = arguments.length < 2 ? false : slice.call(arguments, 1);

  immediateIds[id] = true;

  nextTick(function onNextTick() {
    if (immediateIds[id]) {
      // fn.call() is faster so we optimize for the common use-case
      // @see http://jsperf.com/call-apply-segu
      if (args) {
        fn.apply(null, args);
      } else {
        fn.call(null);
      }
      // Prevent ids from leaking
      exports.clearImmediate(id);
    }
  });

  return id;
};

exports.clearImmediate = typeof clearImmediate === "function" ? clearImmediate : function (id) {
  delete immediateIds[id];
};

}).call(this,require("timers").setImmediate,require("timers").clearImmediate)
},{"process/browser.js":572,"timers":602}],603:[function(require,module,exports){
'use strict';

var native = require('./native');

function getTypeName(fn) {
  return fn.name || fn.toString().match(/function (.*?)\s*\(/)[1];
}

function getValueTypeName(value) {
  return native.Nil(value) ? '' : getTypeName(value.constructor);
}

function getValue(value) {
  if (native.Function(value)) return '';
  if (native.String(value)) return JSON.stringify(value);
  if (value && native.Object(value)) return '';
  return value;
}

function tfJSON(type) {
  if (native.Function(type)) return type.toJSON ? type.toJSON() : getTypeName(type);
  if (native.Array(type)) return 'Array';
  if (type && native.Object(type)) return 'Object';

  return type !== undefined ? type : '';
}

function tfErrorString(type, value, valueTypeName) {
  var valueJson = getValue(value);

  return 'Expected ' + tfJSON(type) + ', got' + (valueTypeName !== '' ? ' ' + valueTypeName : '') + (valueJson !== '' ? ' ' + valueJson : '');
}

function TfTypeError(type, value, valueTypeName) {
  valueTypeName = valueTypeName || getValueTypeName(value);
  this.message = tfErrorString(type, value, valueTypeName);

  Error.captureStackTrace(this, TfTypeError);
  this.__type = type;
  this.__value = value;
  this.__valueTypeName = valueTypeName;
}

TfTypeError.prototype = Object.create(Error.prototype);
TfTypeError.prototype.constructor = TfTypeError;

function tfPropertyErrorString(type, label, name, value, valueTypeName) {
  var description = '" of type ';
  if (label === 'key') description = '" with key type ';

  return tfErrorString('property "' + tfJSON(name) + description + tfJSON(type), value, valueTypeName);
}

function TfPropertyTypeError(type, property, label, value, valueTypeName) {
  if (type) {
    valueTypeName = valueTypeName || getValueTypeName(value);
    this.message = tfPropertyErrorString(type, label, property, value, valueTypeName);
  } else {
    this.message = 'Unexpected property "' + property + '"';
  }

  Error.captureStackTrace(this, TfTypeError);
  this.__label = label;
  this.__property = property;
  this.__type = type;
  this.__value = value;
  this.__valueTypeName = valueTypeName;
}

TfPropertyTypeError.prototype = Object.create(Error.prototype);
TfPropertyTypeError.prototype.constructor = TfTypeError;

function tfCustomError(expected, actual) {
  return new TfTypeError(expected, {}, actual);
}

function tfSubError(e, property, label) {
  // sub child?
  if (e instanceof TfPropertyTypeError) {
    property = property + '.' + e.__property;

    e = new TfPropertyTypeError(e.__type, property, e.__label, e.__value, e.__valueTypeName);

    // child?
  } else if (e instanceof TfTypeError) {
    e = new TfPropertyTypeError(e.__type, property, label, e.__value, e.__valueTypeName);
  }

  Error.captureStackTrace(e);
  return e;
}

module.exports = {
  TfTypeError: TfTypeError,
  TfPropertyTypeError: TfPropertyTypeError,
  tfCustomError: tfCustomError,
  tfSubError: tfSubError,
  tfJSON: tfJSON,
  getValueTypeName: getValueTypeName
};

},{"./native":606}],604:[function(require,module,exports){
(function (Buffer){
'use strict';

var NATIVE = require('./native');
var ERRORS = require('./errors');

function _Buffer(value) {
  return Buffer.isBuffer(value);
}

function Hex(value) {
  return typeof value === 'string' && /^([0-9a-f]{2})+$/i.test(value);
}

function _LengthN(type, length) {
  var name = type.toJSON();

  function Length(value) {
    if (!type(value)) return false;
    if (value.length === length) return true;

    throw ERRORS.tfCustomError(name + '(Length: ' + length + ')', name + '(Length: ' + value.length + ')');
  }
  Length.toJSON = function () {
    return name;
  };

  return Length;
}

var _ArrayN = _LengthN.bind(null, NATIVE.Array);
var _BufferN = _LengthN.bind(null, _Buffer);
var _HexN = _LengthN.bind(null, Hex);
var _StringN = _LengthN.bind(null, NATIVE.String);

function Range(a, b, f) {
  f = f || NATIVE.Number;
  function _range(value, strict) {
    return f(value, strict) && value > a && value < b;
  }
  _range.toJSON = function () {
    return f.toJSON() + ' between [' + a + ', ' + b + ']';
  };
  return _range;
}

var UINT53_MAX = Math.pow(2, 53) - 1;

function Finite(value) {
  return typeof value === 'number' && isFinite(value);
}
function Int8(value) {
  return value << 24 >> 24 === value;
}
function Int16(value) {
  return value << 16 >> 16 === value;
}
function Int32(value) {
  return (value | 0) === value;
}
function UInt8(value) {
  return (value & 0xff) === value;
}
function UInt16(value) {
  return (value & 0xffff) === value;
}
function UInt32(value) {
  return value >>> 0 === value;
}
function UInt53(value) {
  return typeof value === 'number' && value >= 0 && value <= UINT53_MAX && Math.floor(value) === value;
}

var types = {
  ArrayN: _ArrayN,
  Buffer: _Buffer,
  BufferN: _BufferN,
  Finite: Finite,
  Hex: Hex,
  HexN: _HexN,
  Int8: Int8,
  Int16: Int16,
  Int32: Int32,
  Range: Range,
  StringN: _StringN,
  UInt8: UInt8,
  UInt16: UInt16,
  UInt32: UInt32,
  UInt53: UInt53
};

for (var typeName in types) {
  types[typeName].toJSON = function (t) {
    return t;
  }.bind(null, typeName);
}

module.exports = types;

}).call(this,{"isBuffer":require("../is-buffer/index.js")})
},{"../is-buffer/index.js":566,"./errors":603,"./native":606}],605:[function(require,module,exports){
'use strict';

var ERRORS = require('./errors');
var NATIVE = require('./native');

// short-hand
var tfJSON = ERRORS.tfJSON;
var TfTypeError = ERRORS.TfTypeError;
var TfPropertyTypeError = ERRORS.TfPropertyTypeError;
var tfSubError = ERRORS.tfSubError;
var getValueTypeName = ERRORS.getValueTypeName;

var TYPES = {
  arrayOf: function arrayOf(type) {
    type = compile(type);

    function _arrayOf(array, strict) {
      if (!NATIVE.Array(array)) return false;
      if (NATIVE.Nil(array)) return false;

      return array.every(function (value, i) {
        try {
          return typeforce(type, value, strict);
        } catch (e) {
          throw tfSubError(e, i);
        }
      });
    }
    _arrayOf.toJSON = function () {
      return '[' + tfJSON(type) + ']';
    };

    return _arrayOf;
  },

  maybe: function maybe(type) {
    type = compile(type);

    function _maybe(value, strict) {
      return NATIVE.Nil(value) || type(value, strict, maybe);
    }
    _maybe.toJSON = function () {
      return '?' + tfJSON(type);
    };

    return _maybe;
  },

  map: function map(propertyType, propertyKeyType) {
    propertyType = compile(propertyType);
    if (propertyKeyType) propertyKeyType = compile(propertyKeyType);

    function _map(value, strict) {
      if (!NATIVE.Object(value)) return false;
      if (NATIVE.Nil(value)) return false;

      for (var propertyName in value) {
        try {
          if (propertyKeyType) {
            typeforce(propertyKeyType, propertyName, strict);
          }
        } catch (e) {
          throw tfSubError(e, propertyName, 'key');
        }

        try {
          var propertyValue = value[propertyName];
          typeforce(propertyType, propertyValue, strict);
        } catch (e) {
          throw tfSubError(e, propertyName);
        }
      }

      return true;
    }

    if (propertyKeyType) {
      _map.toJSON = function () {
        return '{' + tfJSON(propertyKeyType) + ': ' + tfJSON(propertyType) + '}';
      };
    } else {
      _map.toJSON = function () {
        return '{' + tfJSON(propertyType) + '}';
      };
    }

    return _map;
  },

  object: function object(uncompiled) {
    var type = {};

    for (var typePropertyName in uncompiled) {
      type[typePropertyName] = compile(uncompiled[typePropertyName]);
    }

    function _object(value, strict) {
      if (!NATIVE.Object(value)) return false;
      if (NATIVE.Nil(value)) return false;

      var propertyName;

      try {
        for (propertyName in type) {
          var propertyType = type[propertyName];
          var propertyValue = value[propertyName];

          typeforce(propertyType, propertyValue, strict);
        }
      } catch (e) {
        throw tfSubError(e, propertyName);
      }

      if (strict) {
        for (propertyName in value) {
          if (type[propertyName]) continue;

          throw new TfPropertyTypeError(undefined, propertyName);
        }
      }

      return true;
    }
    _object.toJSON = function () {
      return tfJSON(type);
    };

    return _object;
  },

  oneOf: function oneOf() {
    var types = [].slice.call(arguments).map(compile);

    function _oneOf(value, strict) {
      return types.some(function (type) {
        try {
          return typeforce(type, value, strict);
        } catch (e) {
          return false;
        }
      });
    }
    _oneOf.toJSON = function () {
      return types.map(tfJSON).join('|');
    };

    return _oneOf;
  },

  quacksLike: function quacksLike(type) {
    function _quacksLike(value) {
      return type === getValueTypeName(value);
    }
    _quacksLike.toJSON = function () {
      return type;
    };

    return _quacksLike;
  },

  tuple: function tuple() {
    var types = [].slice.call(arguments).map(compile);

    function _tuple(values, strict) {
      if (NATIVE.Nil(values)) return false;
      if (NATIVE.Nil(values.length)) return false;
      if (strict && values.length !== types.length) return false;

      return types.every(function (type, i) {
        try {
          return typeforce(type, values[i], strict);
        } catch (e) {
          throw tfSubError(e, i);
        }
      });
    }
    _tuple.toJSON = function () {
      return '(' + types.map(tfJSON).join(', ') + ')';
    };

    return _tuple;
  },

  value: function value(expected) {
    function _value(actual) {
      return actual === expected;
    }
    _value.toJSON = function () {
      return expected;
    };

    return _value;
  }
};

function compile(type) {
  if (NATIVE.String(type)) {
    if (type[0] === '?') return TYPES.maybe(type.slice(1));

    return NATIVE[type] || TYPES.quacksLike(type);
  } else if (type && NATIVE.Object(type)) {
    if (NATIVE.Array(type)) return TYPES.arrayOf(type[0]);

    return TYPES.object(type);
  } else if (NATIVE.Function(type)) {
    return type;
  }

  return TYPES.value(type);
}

function typeforce(type, value, strict, surrogate) {
  if (NATIVE.Function(type)) {
    if (type(value, strict)) return true;

    throw new TfTypeError(surrogate || type, value);
  }

  // JIT
  return typeforce(compile(type), value, strict);
}

// assign types to typeforce function
for (var typeName in NATIVE) {
  typeforce[typeName] = NATIVE[typeName];
}

for (typeName in TYPES) {
  typeforce[typeName] = TYPES[typeName];
}

var EXTRA = require('./extra');
for (typeName in EXTRA) {
  typeforce[typeName] = EXTRA[typeName];
}

// async wrapper
function __async(type, value, strict, callback) {
  // default to falsy strict if using shorthand overload
  if (typeof strict === 'function') return __async(type, value, false, strict);

  try {
    typeforce(type, value, strict);
  } catch (e) {
    return callback(e);
  }

  callback();
}

typeforce.async = __async;
typeforce.compile = compile;
typeforce.TfTypeError = TfTypeError;
typeforce.TfPropertyTypeError = TfPropertyTypeError;

module.exports = typeforce;

},{"./errors":603,"./extra":604,"./native":606}],606:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var types = {
  Array: function (_Array) {
    function Array(_x) {
      return _Array.apply(this, arguments);
    }

    Array.toString = function () {
      return _Array.toString();
    };

    return Array;
  }(function (value) {
    return value !== null && value !== undefined && value.constructor === Array;
  }),
  Boolean: function Boolean(value) {
    return typeof value === 'boolean';
  },
  Function: function Function(value) {
    return typeof value === 'function';
  },
  Nil: function Nil(value) {
    return value === undefined || value === null;
  },
  Number: function Number(value) {
    return typeof value === 'number';
  },
  Object: function Object(value) {
    return (typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object';
  },
  String: function String(value) {
    return typeof value === 'string';
  },
  '': function _() {
    return true;
  }

  // TODO: deprecate
};types.Null = types.Nil;

for (var typeName in types) {
  types[typeName].toJSON = function (t) {
    return t;
  }.bind(null, typeName);
}

module.exports = types;

},{}],607:[function(require,module,exports){
'use strict';

module.exports = require('./lib/u2f-api');

},{"./lib/u2f-api":609}],608:[function(require,module,exports){
// Copyright 2014 Google Inc. All rights reserved
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * @fileoverview The U2F api.
 */

'use strict';

/** Namespace for the U2F api.
 * @type {Object}
 */

var u2f = u2f || {};

module.exports = u2f; // Adaptation for u2f-api package

/**
 * The U2F extension id
 * @type {string}
 * @const
 */
u2f.EXTENSION_ID = 'kmendfapggjehodndflmmgagdbamhnfd';

/**
 * Message types for messsages to/from the extension
 * @const
 * @enum {string}
 */
u2f.MessageTypes = {
  'U2F_REGISTER_REQUEST': 'u2f_register_request',
  'U2F_SIGN_REQUEST': 'u2f_sign_request',
  'U2F_REGISTER_RESPONSE': 'u2f_register_response',
  'U2F_SIGN_RESPONSE': 'u2f_sign_response'
};

/**
 * Response status codes
 * @const
 * @enum {number}
 */
u2f.ErrorCodes = {
  'OK': 0,
  'OTHER_ERROR': 1,
  'BAD_REQUEST': 2,
  'CONFIGURATION_UNSUPPORTED': 3,
  'DEVICE_INELIGIBLE': 4,
  'TIMEOUT': 5
};

/**
 * A message type for registration requests
 * @typedef {{
 *   type: u2f.MessageTypes,
 *   signRequests: Array.<u2f.SignRequest>,
 *   registerRequests: ?Array.<u2f.RegisterRequest>,
 *   timeoutSeconds: ?number,
 *   requestId: ?number
 * }}
 */
u2f.Request;

/**
 * A message for registration responses
 * @typedef {{
 *   type: u2f.MessageTypes,
 *   responseData: (u2f.Error | u2f.RegisterResponse | u2f.SignResponse),
 *   requestId: ?number
 * }}
 */
u2f.Response;

/**
 * An error object for responses
 * @typedef {{
 *   errorCode: u2f.ErrorCodes,
 *   errorMessage: ?string
 * }}
 */
u2f.Error;

/**
 * Data object for a single sign request.
 * @typedef {{
 *   version: string,
 *   challenge: string,
 *   keyHandle: string,
 *   appId: string
 * }}
 */
u2f.SignRequest;

/**
 * Data object for a sign response.
 * @typedef {{
 *   keyHandle: string,
 *   signatureData: string,
 *   clientData: string
 * }}
 */
u2f.SignResponse;

/**
 * Data object for a registration request.
 * @typedef {{
 *   version: string,
 *   challenge: string,
 *   appId: string
 * }}
 */
u2f.RegisterRequest;

/**
 * Data object for a registration response.
 * @typedef {{
 *   registrationData: string,
 *   clientData: string
 * }}
 */
u2f.RegisterResponse;

// Low level MessagePort API support

/**
 * Call MessagePort disconnect
 */
u2f.disconnect = function () {
  if (u2f.port_ && u2f.port_.port_) {
    u2f.port_.port_.disconnect();
    u2f.port_ = null;
  }
};

/**
 * Sets up a MessagePort to the U2F extension using the
 * available mechanisms.
 * @param {function((MessagePort|u2f.WrappedChromeRuntimePort_))} callback
 */
u2f.getMessagePort = function (callback) {
  if (typeof chrome != 'undefined' && chrome.runtime) {
    // The actual message here does not matter, but we need to get a reply
    // for the callback to run. Thus, send an empty signature request
    // in order to get a failure response.
    var msg = {
      type: u2f.MessageTypes.U2F_SIGN_REQUEST,
      signRequests: []
    };
    chrome.runtime.sendMessage(u2f.EXTENSION_ID, msg, function () {
      if (!chrome.runtime.lastError) {
        // We are on a whitelisted origin and can talk directly
        // with the extension.
        u2f.getChromeRuntimePort_(callback);
      } else {
        // chrome.runtime was available, but we couldn't message
        // the extension directly, use iframe
        u2f.getIframePort_(callback);
      }
    });
  } else {
    // chrome.runtime was not available at all, which is normal
    // when this origin doesn't have access to any extensions.
    u2f.getIframePort_(callback);
  }
};

/**
 * Connects directly to the extension via chrome.runtime.connect
 * @param {function(u2f.WrappedChromeRuntimePort_)} callback
 * @private
 */
u2f.getChromeRuntimePort_ = function (callback) {
  var port = chrome.runtime.connect(u2f.EXTENSION_ID, { 'includeTlsChannelId': true });
  setTimeout(function () {
    callback(null, new u2f.WrappedChromeRuntimePort_(port));
  }, 0);
};

/**
 * A wrapper for chrome.runtime.Port that is compatible with MessagePort.
 * @param {Port} port
 * @constructor
 * @private
 */
u2f.WrappedChromeRuntimePort_ = function (port) {
  this.port_ = port;
};

/**
 * Posts a message on the underlying channel.
 * @param {Object} message
 */
u2f.WrappedChromeRuntimePort_.prototype.postMessage = function (message) {
  this.port_.postMessage(message);
};

/**
 * Emulates the HTML 5 addEventListener interface. Works only for the
 * onmessage event, which is hooked up to the chrome.runtime.Port.onMessage.
 * @param {string} eventName
 * @param {function({data: Object})} handler
 */
u2f.WrappedChromeRuntimePort_.prototype.addEventListener = function (eventName, handler) {
  var name = eventName.toLowerCase();
  if (name == 'message' || name == 'onmessage') {
    this.port_.onMessage.addListener(function (message) {
      // Emulate a minimal MessageEvent object
      handler({ 'data': message });
    });
  } else {
    console.error('WrappedChromeRuntimePort only supports onMessage');
  }
};

/**
 * Sets up an embedded trampoline iframe, sourced from the extension.
 * @param {function(MessagePort)} callback
 * @private
 */
u2f.getIframePort_ = function (callback) {
  // Create the iframe
  var iframeOrigin = 'chrome-extension://' + u2f.EXTENSION_ID;
  var iframe = document.createElement('iframe');
  iframe.src = iframeOrigin + '/u2f-comms.html';
  iframe.setAttribute('style', 'display:none');
  document.body.appendChild(iframe);

  var hasCalledBack = false;

  var channel = new MessageChannel();
  var ready = function ready(message) {
    if (message.data == 'ready') {
      channel.port1.removeEventListener('message', ready);
      if (!hasCalledBack) {
        hasCalledBack = true;
        callback(null, channel.port1);
      }
    } else {
      console.error('First event on iframe port was not "ready"');
    }
  };
  channel.port1.addEventListener('message', ready);
  channel.port1.start();

  iframe.addEventListener('load', function () {
    // Deliver the port to the iframe and initialize
    iframe.contentWindow.postMessage('init', iframeOrigin, [channel.port2]);
  });

  // Give this 200ms to initialize, after that, we treat this method as failed
  setTimeout(function () {
    if (!hasCalledBack) {
      hasCalledBack = true;
      callback(new Error("IFrame extension not supported"));
    }
  }, 200);
};

// High-level JS API

/**
 * Default extension response timeout in seconds.
 * @const
 */
u2f.EXTENSION_TIMEOUT_SEC = 30;

/**
 * A singleton instance for a MessagePort to the extension.
 * @type {MessagePort|u2f.WrappedChromeRuntimePort_}
 * @private
 */
u2f.port_ = null;

/**
 * Callbacks waiting for a port
 * @type {Array.<function((MessagePort|u2f.WrappedChromeRuntimePort_))>}
 * @private
 */
u2f.waitingForPort_ = [];

/**
 * A counter for requestIds.
 * @type {number}
 * @private
 */
u2f.reqCounter_ = 0;

/**
 * A map from requestIds to client callbacks
 * @type {Object.<number,(function((u2f.Error|u2f.RegisterResponse))
 *                       |function((u2f.Error|u2f.SignResponse)))>}
 * @private
 */
u2f.callbackMap_ = {};

/**
 * Creates or retrieves the MessagePort singleton to use.
 * @param {function((MessagePort|u2f.WrappedChromeRuntimePort_))} callback
 * @private
 */
u2f.getPortSingleton_ = function (callback) {
  if (u2f.port_) {
    callback(null, u2f.port_);
  } else {
    if (u2f.waitingForPort_.length == 0) {
      u2f.getMessagePort(function (err, port) {
        if (!err) {
          u2f.port_ = port;
          u2f.port_.addEventListener('message',
          /** @type {function(Event)} */u2f.responseHandler_);
        }

        // Careful, here be async callbacks. Maybe.
        while (u2f.waitingForPort_.length) {
          u2f.waitingForPort_.shift()(err, port);
        }
      });
    }
    u2f.waitingForPort_.push(callback);
  }
};

/**
 * Handles response messages from the extension.
 * @param {MessageEvent.<u2f.Response>} message
 * @private
 */
u2f.responseHandler_ = function (message) {
  var response = message.data;
  var reqId = response['requestId'];
  if (!reqId || !u2f.callbackMap_[reqId]) {
    console.error('Unknown or missing requestId in response.');
    return;
  }
  var cb = u2f.callbackMap_[reqId];
  delete u2f.callbackMap_[reqId];
  cb(null, response['responseData']);
};

/**
 * Calls the callback with true or false as first and only argument
 * @param {Function} callback
 */
u2f.isSupported = function (callback) {
  u2f.getPortSingleton_(function (err, port) {
    callback(!err);
  });
};

/**
 * Dispatches an array of sign requests to available U2F tokens.
 * @param {Array.<u2f.SignRequest>} signRequests
 * @param {function((u2f.Error|u2f.SignResponse))} callback
 * @param {number=} opt_timeoutSeconds
 */
u2f.sign = function (signRequests, callback, opt_timeoutSeconds) {
  u2f.getPortSingleton_(function (err, port) {
    if (err) return callback(err);

    var reqId = ++u2f.reqCounter_;
    u2f.callbackMap_[reqId] = callback;
    var req = {
      type: u2f.MessageTypes.U2F_SIGN_REQUEST,
      signRequests: signRequests,
      timeoutSeconds: typeof opt_timeoutSeconds !== 'undefined' ? opt_timeoutSeconds : u2f.EXTENSION_TIMEOUT_SEC,
      requestId: reqId
    };
    port.postMessage(req);
  });
};

/**
 * Dispatches register requests to available U2F tokens. An array of sign
 * requests identifies already registered tokens.
 * @param {Array.<u2f.RegisterRequest>} registerRequests
 * @param {Array.<u2f.SignRequest>} signRequests
 * @param {function((u2f.Error|u2f.RegisterResponse))} callback
 * @param {number=} opt_timeoutSeconds
 */
u2f.register = function (registerRequests, signRequests, callback, opt_timeoutSeconds) {
  u2f.getPortSingleton_(function (err, port) {
    if (err) return callback(err);

    var reqId = ++u2f.reqCounter_;
    u2f.callbackMap_[reqId] = callback;
    var req = {
      type: u2f.MessageTypes.U2F_REGISTER_REQUEST,
      signRequests: signRequests,
      registerRequests: registerRequests,
      timeoutSeconds: typeof opt_timeoutSeconds !== 'undefined' ? opt_timeoutSeconds : u2f.EXTENSION_TIMEOUT_SEC,
      requestId: reqId
    };
    port.postMessage(req);
  });
};

},{}],609:[function(require,module,exports){
(function (global){
'use strict';

module.exports = API;

var chromeApi = require('./google-u2f-api');

// Feature detection (yes really)
var isBrowser = typeof navigator !== 'undefined' && !!navigator.userAgent;
var isSafari = isBrowser && navigator.userAgent.match(/Safari\//) && !navigator.userAgent.match(/Chrome\//);
var isEDGE = isBrowser && navigator.userAgent.match(/Edge\/1[2345]/);

var _backend = null;
function getBackend(Promise) {
	if (!_backend) _backend = new Promise(function (resolve, reject) {
		function notSupported() {
			// Note; {native: true} means *not* using Google's hack
			resolve({ u2f: null, native: true });
		}

		if (!isBrowser) return notSupported();

		if (isSafari)
			// Safari doesn't support U2F, and the Safari-FIDO-U2F
			// extension lacks full support (Multi-facet apps), so we
			// block it until proper support.
			return notSupported();

		var hasNativeSupport = typeof window.u2f !== 'undefined' && typeof window.u2f.sign === 'function';

		if (hasNativeSupport) resolve({ u2f: window.u2f, native: true });

		if (isEDGE)
			// We don't want to check for Google's extension hack on EDGE
			// as it'll cause trouble (popups, etc)
			return notSupported();

		if (location.protocol === 'http:')
			// U2F isn't supported over http, only https
			return notSupported();

		if (typeof MessageChannel === 'undefined')
			// Unsupported browser, the chrome hack would throw
			return notSupported();

		// Test for google extension support
		chromeApi.isSupported(function (ok) {
			if (ok) resolve({ u2f: chromeApi, native: false });else notSupported();
		});
	});

	return _backend;
}

function API(Promise) {
	return {
		isSupported: isSupported.bind(Promise),
		ensureSupport: ensureSupport.bind(Promise),
		register: register.bind(Promise),
		sign: sign.bind(Promise),
		ErrorCodes: API.ErrorCodes,
		ErrorNames: API.ErrorNames
	};
}

API.ErrorCodes = {
	CANCELLED: -1,
	OK: 0,
	OTHER_ERROR: 1,
	BAD_REQUEST: 2,
	CONFIGURATION_UNSUPPORTED: 3,
	DEVICE_INELIGIBLE: 4,
	TIMEOUT: 5
};
API.ErrorNames = {
	"-1": "CANCELLED",
	"0": "OK",
	"1": "OTHER_ERROR",
	"2": "BAD_REQUEST",
	"3": "CONFIGURATION_UNSUPPORTED",
	"4": "DEVICE_INELIGIBLE",
	"5": "TIMEOUT"
};

function makeError(msg, err) {
	var code = err != null ? err.errorCode : 1; // Default to OTHER_ERROR
	var type = API.ErrorNames['' + code];
	var error = new Error(msg);
	error.metaData = {
		type: type,
		code: code
	};
	return error;
}

function deferPromise(Promise, promise) {
	var ret = {};
	ret.promise = new Promise(function (resolve, reject) {
		ret.resolve = resolve;
		ret.reject = reject;
		promise.then(resolve, reject);
	});
	/**
  * Reject request promise and disconnect port if 'disconnect' flag is true
  * @param {string} msg
  * @param {boolean} disconnect
  */
	ret.promise.cancel = function (msg, disconnect) {
		getBackend(Promise).then(function (backend) {
			if (disconnect && !backend.native) backend.u2f.disconnect();

			ret.reject(makeError(msg, { errorCode: -1 }));
		});
	};
	return ret;
}

function defer(Promise, fun) {
	return deferPromise(Promise, new Promise(function (resolve, reject) {
		try {
			fun && fun(resolve, reject);
		} catch (err) {
			reject(err);
		}
	}));
}

function isSupported() {
	var Promise = this;

	return getBackend(Promise).then(function (backend) {
		return !!backend.u2f;
	});
}

function _ensureSupport(backend) {
	if (!backend.u2f) {
		if (location.protocol === 'http:') throw new Error("U2F isn't supported over http, only https");
		throw new Error("U2F not supported");
	}
}

function ensureSupport() {
	var Promise = this;

	return getBackend(Promise).then(_ensureSupport);
}

function register(registerRequests, signRequests /* = null */, timeout) {
	var Promise = this;

	if (!Array.isArray(registerRequests)) registerRequests = [registerRequests];

	if (typeof signRequests === 'number' && typeof timeout === 'undefined') {
		timeout = signRequests;
		signRequests = null;
	}

	if (!signRequests) signRequests = [];

	return deferPromise(Promise, getBackend(Promise).then(function (backend) {
		_ensureSupport(backend);

		var native = backend.native;
		var u2f = backend.u2f;

		return new Promise(function (resolve, reject) {
			function cbNative(response) {
				if (response.errorCode) reject(makeError("Registration failed", response));else {
					delete response.errorCode;
					resolve(response);
				}
			}

			function cbChrome(err, response) {
				if (err) reject(err);else if (response.errorCode) reject(makeError("Registration failed", response));else resolve(response);
			}

			if (native) {
				var appId = registerRequests[0].appId;

				u2f.register(appId, registerRequests, signRequests, cbNative, timeout);
			} else {
				u2f.register(registerRequests, signRequests, cbChrome, timeout);
			}
		});
	})).promise;
}

function sign(signRequests, timeout) {
	var Promise = this;

	if (!Array.isArray(signRequests)) signRequests = [signRequests];

	return deferPromise(Promise, getBackend(Promise).then(function (backend) {
		_ensureSupport(backend);

		var native = backend.native;
		var u2f = backend.u2f;

		return new Promise(function (resolve, reject) {
			function cbNative(response) {
				if (response.errorCode) reject(makeError("Sign failed", response));else {
					delete response.errorCode;
					resolve(response);
				}
			}

			function cbChrome(err, response) {
				if (err) reject(err);else if (response.errorCode) reject(makeError("Sign failed", response));else resolve(response);
			}

			if (native) {
				var appId = signRequests[0].appId;
				var challenge = signRequests[0].challenge;

				u2f.sign(appId, challenge, signRequests, cbNative, timeout);
			} else {
				u2f.sign(signRequests, cbChrome, timeout);
			}
		});
	})).promise;
}

function makeDefault(func) {
	API[func] = function () {
		if (!global.Promise)
			// This is very unlikely to ever happen, since browsers
			// supporting U2F will most likely support Promises.
			throw new Error("The platform doesn't natively support promises");

		var args = [].slice.call(arguments);
		return API(global.Promise)[func].apply(null, args);
	};
}

// Provide default functions using the built-in Promise if available.
makeDefault('isSupported');
makeDefault('ensureSupport');
makeDefault('register');
makeDefault('sign');

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./google-u2f-api":608}],610:[function(require,module,exports){
(function (global){
'use strict';

/**
 * Module exports.
 */

module.exports = deprecate;

/**
 * Mark that a method should not be used.
 * Returns a modified function which warns once by default.
 *
 * If `localStorage.noDeprecation = true` is set, then it is a no-op.
 *
 * If `localStorage.throwDeprecation = true` is set, then deprecated functions
 * will throw an Error when invoked.
 *
 * If `localStorage.traceDeprecation = true` is set, then deprecated functions
 * will invoke `console.trace()` instead of `console.error()`.
 *
 * @param {Function} fn - the function to deprecate
 * @param {String} msg - the string to print to the console when `fn` is invoked
 * @returns {Function} a new "deprecated" version of `fn`
 * @api public
 */

function deprecate(fn, msg) {
  if (config('noDeprecation')) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (config('throwDeprecation')) {
        throw new Error(msg);
      } else if (config('traceDeprecation')) {
        console.trace(msg);
      } else {
        console.warn(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
}

/**
 * Checks `localStorage` for boolean values for the given `name`.
 *
 * @param {String} name
 * @returns {Boolean}
 * @api private
 */

function config(name) {
  // accessing global.localStorage can trigger a DOMException in sandboxed iframes
  try {
    if (!global.localStorage) return false;
  } catch (_) {
    return false;
  }
  var val = global.localStorage[name];
  if (null == val) return false;
  return String(val).toLowerCase() === 'true';
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],611:[function(require,module,exports){
'use strict';

var Buffer = require('safe-buffer').Buffer;

// Number.MAX_SAFE_INTEGER
var MAX_SAFE_INTEGER = 9007199254740991;

function checkUInt53(n) {
  if (n < 0 || n > MAX_SAFE_INTEGER || n % 1 !== 0) throw new RangeError('value out of range');
}

function encode(number, buffer, offset) {
  checkUInt53(number);

  if (!buffer) buffer = Buffer.allocUnsafe(encodingLength(number));
  if (!Buffer.isBuffer(buffer)) throw new TypeError('buffer must be a Buffer instance');
  if (!offset) offset = 0;

  // 8 bit
  if (number < 0xfd) {
    buffer.writeUInt8(number, offset);
    encode.bytes = 1;

    // 16 bit
  } else if (number <= 0xffff) {
    buffer.writeUInt8(0xfd, offset);
    buffer.writeUInt16LE(number, offset + 1);
    encode.bytes = 3;

    // 32 bit
  } else if (number <= 0xffffffff) {
    buffer.writeUInt8(0xfe, offset);
    buffer.writeUInt32LE(number, offset + 1);
    encode.bytes = 5;

    // 64 bit
  } else {
    buffer.writeUInt8(0xff, offset);
    buffer.writeUInt32LE(number >>> 0, offset + 1);
    buffer.writeUInt32LE(number / 0x100000000 | 0, offset + 5);
    encode.bytes = 9;
  }

  return buffer;
}

function decode(buffer, offset) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('buffer must be a Buffer instance');
  if (!offset) offset = 0;

  var first = buffer.readUInt8(offset);

  // 8 bit
  if (first < 0xfd) {
    decode.bytes = 1;
    return first;

    // 16 bit
  } else if (first === 0xfd) {
    decode.bytes = 3;
    return buffer.readUInt16LE(offset + 1);

    // 32 bit
  } else if (first === 0xfe) {
    decode.bytes = 5;
    return buffer.readUInt32LE(offset + 1);

    // 64 bit
  } else {
    decode.bytes = 9;
    var lo = buffer.readUInt32LE(offset + 1);
    var hi = buffer.readUInt32LE(offset + 5);
    var number = hi * 0x0100000000 + lo;
    checkUInt53(number);

    return number;
  }
}

function encodingLength(number) {
  checkUInt53(number);

  return number < 0xfd ? 1 : number <= 0xffff ? 3 : number <= 0xffffffff ? 5 : 9;
}

module.exports = { encode: encode, decode: decode, encodingLength: encodingLength };

},{"safe-buffer":591}],612:[function(require,module,exports){
(function (Buffer){
'use strict';

var bs58check = require('bs58check');

function decodeRaw(buffer, version) {
  // check version only if defined
  if (version !== undefined && buffer[0] !== version) throw new Error('Invalid network version');

  // uncompressed
  if (buffer.length === 33) {
    return {
      version: buffer[0],
      privateKey: buffer.slice(1, 33),
      compressed: false
    };
  }

  // invalid length
  if (buffer.length !== 34) throw new Error('Invalid WIF length');

  // invalid compression flag
  if (buffer[33] !== 0x01) throw new Error('Invalid compression flag');

  return {
    version: buffer[0],
    privateKey: buffer.slice(1, 33),
    compressed: true
  };
}

function encodeRaw(version, privateKey, compressed) {
  var result = new Buffer(compressed ? 34 : 33);

  result.writeUInt8(version, 0);
  privateKey.copy(result, 1);

  if (compressed) {
    result[33] = 0x01;
  }

  return result;
}

function decode(string, version) {
  return decodeRaw(bs58check.decode(string), version);
}

function encode(version, privateKey, compressed) {
  if (typeof version === 'number') return bs58check.encode(encodeRaw(version, privateKey, compressed));

  return bs58check.encode(encodeRaw(version.version, version.privateKey, version.compressed));
}

module.exports = {
  decode: decode,
  decodeRaw: decodeRaw,
  encode: encode,
  encodeRaw: encodeRaw
};

}).call(this,require("buffer").Buffer)
},{"bs58check":120,"buffer":121}],613:[function(require,module,exports){
(function (Buffer){
'use strict';

var networks = require('./networks');
var bs58 = require('bs58');
var shajs = require('sha.js');
var RIPEMD160 = require('ripemd160');
var padStart = require('lodash.padstart');
var bitcoinjs = require('bitcoinjs-lib');
var zcashjs = require('bitcoinjs-lib-zcash');

function sha256(buffer) {
  return shajs('sha256').update(buffer).digest();
}

function ripemd160(buffer) {
  return new RIPEMD160().update(buffer).digest();
}

function parseHexString(str) {
  var result = [];
  while (str.length >= 2) {
    result.push(parseInt(str.substring(0, 2), 16));
    str = str.substring(2, str.length);
  }
  return result;
}

function compressPublicKey(publicKey) {
  var compressedKeyIndex = void 0;
  if (publicKey.substring(0, 2) !== '04') {
    throw 'Invalid public key format';
  }
  if (parseInt(publicKey.substring(128, 130), 16) % 2 !== 0) {
    compressedKeyIndex = '03';
  } else {
    compressedKeyIndex = '02';
  }
  return compressedKeyIndex + publicKey.substring(2, 66);
}

function toHexDigit(number) {
  var digits = '0123456789abcdef';
  return digits.charAt(number >> 4) + digits.charAt(number & 0x0f);
}

function toHexInt(number) {
  return toHexDigit(number >> 24 & 0xff) + toHexDigit(number >> 16 & 0xff) + toHexDigit(number >> 8 & 0xff) + toHexDigit(number & 0xff);
}

function encodeBase58Check(vchIn) {
  vchIn = parseHexString(vchIn);
  var chksum = sha256(vchIn);
  chksum = sha256(chksum);
  chksum = chksum.slice(0, 4);
  var hash = vchIn.concat(Array.from(chksum));
  return bs58.encode(hash);
}

function createXPUB(depth, fingerprint, childnum, chaincode, publicKey, network) {
  var xpub = toHexInt(network);
  xpub = xpub + padStart(depth.toString(16), 2, '0');
  xpub = xpub + padStart(fingerprint.toString(16), 8, '0');
  xpub = xpub + padStart(childnum.toString(16), 8, '0');
  xpub = xpub + chaincode;
  xpub = xpub + publicKey;
  return xpub;
}

function getNetworkBySymbol(symbol) {
  var networkId = Object.keys(networks).find(function (id) {
    return networks[id].unit === symbol;
  });
  return networks[networkId];
}

function deriveExtendedPublicKey() {
  var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
      symbol = _ref.symbol,
      derivationPath = _ref.derivationPath,
      pubKey = _ref.pubKey,
      chainCode = _ref.chainCode,
      parentPubKey = _ref.parentPubKey;

  var network = getNetworkBySymbol(symbol).bitcoinjs;
  if (!network) throw new Error('Symbol \'' + symbol + '\' not supported');
  var finalize = function finalize(fingerprint) {
    var publicKey = compressPublicKey(pubKey);
    var path = derivationPath.split('/');
    var depth = path.length;
    var lastChild = path[path.length - 1].split('\'');
    var childnum = lastChild.length === 1 ? parseInt(lastChild[0]) : (0x80000000 | parseInt(lastChild[0])) >>> 0;
    var xpub = createXPUB(depth, fingerprint, childnum, chainCode, publicKey, network.bip32.public);
    return encodeBase58Check(xpub);
  };
  var parentPublicKey = compressPublicKey(parentPubKey);
  var parentPublicKeyIntArray = parseHexString(parentPublicKey);
  var hash = sha256(parentPublicKeyIntArray);
  var result = ripemd160(hash);
  var fingerprint = (result[0] << 24 | result[1] << 16 | result[2] << 8 | result[3]) >>> 0;
  return finalize(fingerprint);
}

var deriveAddress = function deriveAddress(_ref2) {
  var symbol = _ref2.symbol,
      xpub = _ref2.xpub,
      path = _ref2.path,
      isSegwit = _ref2.isSegwit;

  var libjs = symbol === 'ZEC' ? zcashjs : bitcoinjs;
  var network = getNetworkBySymbol(symbol).bitcoinjs;
  var hdnode = libjs.HDNode.fromBase58(xpub, network);
  if (!isSegwit) {
    return hdnode.neutered().derivePath(path).getAddress();
  }
  var pubKey = hdnode.derivePath(path).getPublicKeyBuffer();
  var script = [0x00, 0x14].concat(Array.from(libjs.crypto.hash160(pubKey)));
  var hash160 = libjs.crypto.hash160(Buffer.from(script));
  return libjs.address.toBase58Check(hash160, network.scriptHash);
};

exports.deriveExtendedPublicKey = deriveExtendedPublicKey;
exports.deriveAddress = deriveAddress;
exports.networks = networks;

}).call(this,require("buffer").Buffer)
},{"./networks":614,"bitcoinjs-lib":88,"bitcoinjs-lib-zcash":51,"bs58":118,"buffer":121,"lodash.padstart":568,"ripemd160":590,"sha.js":593}],614:[function(require,module,exports){
(function (Buffer){
"use strict";

module.exports = {
  0: {
    apiName: "btc",
    unit: "BTC",
    name: "bitcoin",
    satoshi: 8,
    bitcoinjs: {
      bech32: "bc",
      bip32: {
        private: 76066276,
        public: 76067358
      },
      messagePrefix: "Bitcoin Signed Message:",
      pubKeyHash: 0,
      scriptHash: 5,
      wif: 128
    },
    isSegwitSupported: true,
    handleFeePerByte: true
  },
  1: {
    apiName: "btc_testnet",
    unit: "BTC",
    name: "btc testnet",
    satoshi: 8,
    bitcoinjs: {
      bech32: "bc",
      bip32: {
        private: 70615956,
        public: 70617039
      },
      messagePrefix: "Bitcoin Signed Message:",
      pubKeyHash: 111,
      scriptHash: 196,
      wif: 239
    },
    isSegwitSupported: true,
    handleFeePerByte: true
  },
  2: {
    name: "litecoin",
    unit: "LTC",
    apiName: "ltc",
    isSegwitSupported: true,
    satoshi: 8,
    bitcoinjs: {
      bech32: "bc",
      bip32: {
        private: 0x019d9cfe,
        public: 0x019da462
      },
      messagePrefix: "Litecoin Signed Message:",
      pubKeyHash: 48,
      scriptHash: 50,
      wif: 0xb0
    },
    handleFeePerByte: false
  },
  145: {
    name: "bitcoin cash",
    apiName: "abc",
    satoshi: 8,
    unit: "BCH",
    bitcoinjs: {
      bech32: "bc",
      bip32: {
        private: 76066276,
        public: 76067358
      },
      messagePrefix: "Bitcoin Signed Message:",
      pubKeyHash: 0,
      scriptHash: 5,
      wif: 128
    },
    sigHash: 0x41,
    isSegwitSupported: true,
    handleFeePerByte: true,
    additionals: ["abc"]
  },
  128: {
    apiName: "vtc",
    unit: "VTC",
    satoshi: 8,
    name: "Vertcoin",
    bitcoinjs: {
      bip32: {
        public: 0x0488b21e,
        private: 0x05358394
      },
      messagePrefix: "Vertcoin Signed Message:",
      pubKeyHash: 71,
      scriptHash: 5,
      wif: 128
    },
    isSegwitSupported: true,
    handleFeePerByte: false
  },
  5: {
    name: "dash",
    satoshi: 8,
    unit: "DASH",
    apiName: "dash",
    bitcoinjs: {
      messagePrefix: "DarkCoin Signed Message:",
      bip32: { public: 50221816, private: 87393172 },
      pubKeyHash: 76,
      scriptHash: 16,
      wif: 128
    },
    isSegwitSupported: false,
    handleFeePerByte: false,
    areTransactionTimestamped: undefined
  },
  6: {
    name: "peercoin",
    satoshi: 6,
    unit: "PPC",
    apiName: "ppc",
    bitcoinjs: {
      messagePrefix: "PPCoin Signed Message:",
      bip32: { public: 3874023909, private: 87393172 },
      pubKeyHash: 55,
      scriptHash: 117,
      wif: 128
    },
    isSegwitSupported: false,
    handleFeePerByte: false,
    areTransactionTimestamped: true
  },
  14: {
    name: "viacoin",
    satoshi: 8,
    unit: "VIA",
    apiName: "via",
    bitcoinjs: {
      messagePrefix: "Viacoin Signed Message:",
      bip32: { public: 76067358, private: 87393172 },
      pubKeyHash: 71,
      scriptHash: 33,
      wif: 128
    },
    isSegwitSupported: true,
    handleFeePerByte: false,
    areTransactionTimestamped: false
  },
  20: {
    name: "digibyte",
    satoshi: 8,
    unit: "DGB",
    apiName: "dgb",
    bitcoinjs: {
      messagePrefix: "DigiByte Signed Message:",
      bip32: { public: 76067358, private: 87393172 },
      pubKeyHash: 30,
      scriptHash: 5,
      wif: 128
    },
    isSegwitSupported: false,
    handleFeePerByte: false,
    areTransactionTimestamped: false
  },
  47: {
    name: "poswallet",
    satoshi: 8,
    unit: "POSW",
    apiName: "posw",
    bitcoinjs: {
      messagePrefix: "PoSWallet Signed Message:",
      bip32: { public: 76067358, private: 87393172 },
      pubKeyHash: 55,
      scriptHash: 85,
      wif: 128
    },
    isSegwitSupported: false,
    handleFeePerByte: false,
    areTransactionTimestamped: true
  },
  77: {
    name: "pivx",
    satoshi: 8,
    unit: "PIV",
    apiName: "pivx",
    bitcoinjs: {
      messagePrefix: "DarkNet Signed Message:",
      bip32: { public: 36513075, private: 87393172 },
      pubKeyHash: 30,
      scriptHash: 13,
      wif: 128
    },
    isSegwitSupported: false,
    handleFeePerByte: false,
    areTransactionTimestamped: false
  },
  79: {
    name: "clubcoin",
    satoshi: 8,
    unit: "CLUB",
    apiName: "club",
    bitcoinjs: {
      messagePrefix: "ClubCoin Signed Message:",
      bip32: { public: 76067358, private: 87393172 },
      pubKeyHash: 28,
      scriptHash: 85,
      wif: 128
    },
    isSegwitSupported: false,
    handleFeePerByte: false,
    areTransactionTimestamped: true
  },
  88: {
    name: "qtum",
    satoshi: 8,
    unit: "QTUM",
    apiName: "qtum",
    bitcoinjs: {
      messagePrefix: "Qtum Signed Message:",
      bip32: { public: 76067358, private: 87393172 },
      pubKeyHash: 58,
      scriptHash: 50,
      wif: 128
    },
    isSegwitSupported: true,
    handleFeePerByte: false,
    areTransactionTimestamped: undefined
  },
  105: {
    name: "stratis",
    satoshi: 8,
    unit: "STRAT",
    apiName: "strat",
    bitcoinjs: {
      messagePrefix: "Stratis Signed Message:",
      bip32: { public: 76071454, private: 87393172 },
      pubKeyHash: 63,
      scriptHash: 125,
      wif: 128
    },
    isSegwitSupported: false,
    handleFeePerByte: false,
    areTransactionTimestamped: true
  },
  125: {
    name: "stealthcoin",
    satoshi: 6,
    unit: "XST",
    apiName: "xst",
    bitcoinjs: {
      messagePrefix: "StealthCoin Signed Message:",
      bip32: { public: 2405583718, private: 87393172 },
      pubKeyHash: 62,
      scriptHash: 85,
      wif: 128
    },
    isSegwitSupported: false,
    handleFeePerByte: false,
    areTransactionTimestamped: true
  },
  133: {
    name: "zcash",
    satoshi: 8,
    unit: "ZEC",
    apiName: "zec",
    bitcoinjs: {
      messagePrefix: "Zcash Signed Message:",
      bip32: { public: 76067358, private: 87393172 },
      pubKeyHash: 7352,
      scriptHash: 7357,
      wif: 128
    },
    isSegwitSupported: false,
    handleFeePerByte: false,
    areTransactionTimestamped: undefined,
    expiryHeight: Buffer.from("00000000", 'hex')
  },
  141: {
    name: "komodo",
    satoshi: 8,
    unit: "KMD",
    apiName: "kmd",
    bitcoinjs: {
      messagePrefix: "Komodo Signed Message:",
      bip32: { public: 4193182861, private: 87393172 },
      pubKeyHash: 60,
      scriptHash: 85,
      wif: 128
    },
    isSegwitSupported: false,
    handleFeePerByte: false,
    areTransactionTimestamped: undefined
  },
  156: {
    name: "bitcoin gold",
    satoshi: 8,
    unit: "BTG",
    apiName: "btg",
    bitcoinjs: {
      messagePrefix: "Bitcoin gold Signed Message:",
      bip32: { public: 76067358, private: 76066276 },
      pubKeyHash: 38,
      scriptHash: 23,
      wif: 128
    },
    sigHash: 0x41,
    isSegwitSupported: true,
    handleFeePerByte: true,
    areTransactionTimestamped: undefined,
    additionals: ["gold"]
  },
  171: {
    name: "hcash",
    satoshi: 8,
    unit: "HSR",
    apiName: "hsr",
    bitcoinjs: {
      messagePrefix: "HShare Signed Message:",
      bip32: { public: 76071454, private: 87393172 },
      pubKeyHash: 40,
      scriptHash: 100,
      wif: 128
    },
    isSegwitSupported: false,
    handleFeePerByte: false,
    areTransactionTimestamped: true
  },
  121: {
    name: "zencash",
    satoshi: 8,
    unit: "ZEN",
    apiName: "zen",
    bitcoinjs: {
      messagePrefix: "Zencash Signed Message:",
      bip32: { public: 76067358, private: 87393172 },
      pubKeyHash: 0x2089,
      scriptHash: 0x2096,
      wif: 128
    }
  },
  3: {
    name: "dogecoin",
    satoshi: 8,
    unit: "Ð",
    apiName: "doge",
    bitcoinjs: {
      messagePrefix: "Dogecoin Signed Message:",
      bip32: { public: 0x02facafd, private: 87393172 },
      pubKeyHash: 30,
      scriptHash: 22,
      wif: 128
    }
  }
};

}).call(this,require("buffer").Buffer)
},{"buffer":121}],615:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.detectSymbol = detectSymbol;
var patterns = {
  BTC: '^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$',
  ETH: '^0x[a-fA-F0-9]{40}$',
  LTC: '^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$',
  ZEC: '^[tz][a-km-zA-HJ-NP-Z1-9]{25,34}$'
};

function detectSymbol(address) {
  var detectedSymbol = null;
  Object.keys(patterns).some(function (symbol) {
    var pattern = patterns[symbol];
    var regex = new RegExp(pattern);
    var test = regex.test(address);
    if (test) {
      detectedSymbol = symbol;
      return true;
    }
  });
  return detectedSymbol;
}

var symbols = exports.symbols = Object.keys(patterns);

},{}],616:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _hwTransportU2f = require('@ledgerhq/hw-transport-u2f');

var _hwTransportU2f2 = _interopRequireDefault(_hwTransportU2f);

var _hwAppBtc = require('@ledgerhq/hw-app-btc');

var _hwAppBtc2 = _interopRequireDefault(_hwAppBtc);

var _hwAppEth = require('@ledgerhq/hw-app-eth');

var _hwAppEth2 = _interopRequireDefault(_hwAppEth);

var _xpubjs = require('xpubjs');

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _detectSymbol = require('./detectSymbol');

require('babel-polyfill');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var defaultDerivationPath = {
  BTC: "44'/0'/0'",
  LTC: "44'/2'/0'",
  ETH: "44'/60'/0'",
  ZEC: "44'/133'/0'"
};

var segwitSymbols = Object.keys(_xpubjs.networks).filter(function (i) {
  return _xpubjs.networks[i].isSegwitSupported;
}).map(function (i) {
  return _xpubjs.networks[i].unit;
});

var wallets = {
  BTC: ['BTC', 'LTC', 'ZEC'],
  ETH: ['ETH', 'ETC']
};

var LedgerSDK = function (_EventEmitter) {
  _inherits(LedgerSDK, _EventEmitter);

  function LedgerSDK() {
    _classCallCheck(this, LedgerSDK);

    var _this = _possibleConstructorReturn(this, (LedgerSDK.__proto__ || Object.getPrototypeOf(LedgerSDK)).call(this));

    _this.walletIndex = 0;
    _this.symbol = null;
    _this.busy = false;
    return _this;
  }

  _createClass(LedgerSDK, [{
    key: 'getSupportedSymbols',
    value: function getSupportedSymbols() {
      return _detectSymbol.symbols;
    }
  }, {
    key: 'createTransport',
    value: function () {
      var _ref = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee() {
        var _this2 = this;

        return regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                _context.next = 2;
                return _hwTransportU2f2.default.create();

              case 2:
                this.transport = _context.sent;

                // this.transport.setDebugMode(true)
                this.transport.setExchangeTimeout(2000);
                this.transport.on('disconnect', function () {
                  return _this2.emit('disconnect');
                });

              case 5:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function createTransport() {
        return _ref.apply(this, arguments);
      }

      return createTransport;
    }()
  }, {
    key: 'handleSymbol',
    value: function handleSymbol(symbol, data) {
      this.busy = false;
      if (this.symbol === symbol) return;
      if (_detectSymbol.symbols.includes(symbol)) {
        if (this.symbol) {
          this.emit(this.symbol + ':close');
          this.emit('close');
        }
        this.symbol = symbol;
        this.emit(symbol + ':open', data);
        this.emit('open', Object.assign({ symbol: symbol }, data));
      }
    }
  }, {
    key: 'getWalletIndex',
    value: function getWalletIndex() {
      var _this3 = this;

      return Object.keys(wallets).findIndex(function (w) {
        return wallets[w].includes(_this3.symbol);
      });
    }
  }, {
    key: 'close',
    value: function close(err) {
      this.busy = false;
      if (!this.symbol) return;
      this.emit(this.symbol + ':close');
      this.emit('close');
      this.symbol = null;
      try {
        this.transport.close();
      } catch (error) {}
    }
  }, {
    key: 'pingDevice',
    value: function () {
      var _ref2 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee2() {
        var _this4 = this;

        return regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                if (!this.busy) {
                  _context2.next = 2;
                  break;
                }

                return _context2.abrupt('return');

              case 2:
                if (this.symbol) {
                  this.walletIndex = this.getWalletIndex();
                }
                this.walletIndex += 1;
                this.busy = true;
                _context2.t0 = this.walletIndex;
                _context2.next = _context2.t0 === 1 ? 8 : _context2.t0 === 2 ? 9 : 10;
                break;

              case 8:
                return _context2.abrupt('return', this.checkBTC().catch(function (err) {
                  _this4.close(err);
                }));

              case 9:
                return _context2.abrupt('return', this.checkETH().catch(function (err) {
                  _this4.close(err);
                }));

              case 10:
                this.walletIndex = 0;

              case 11:
                this.busy = false;

              case 12:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function pingDevice() {
        return _ref2.apply(this, arguments);
      }

      return pingDevice;
    }()
  }, {
    key: 'start',
    value: function () {
      var _ref3 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee3() {
        var _this5 = this;

        return regeneratorRuntime.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                _context3.next = 2;
                return this.createTransport();

              case 2:
                this.pollInterval = setInterval(function () {
                  return _this5.pingDevice();
                }, 1350);

              case 3:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function start() {
        return _ref3.apply(this, arguments);
      }

      return start;
    }()
  }, {
    key: 'stop',
    value: function stop() {
      clearInterval(this.pollInterval);
    }
  }, {
    key: 'getBTCData',
    value: function () {
      var _ref5 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee4(_ref4) {
        var btc = _ref4.btc,
            symbol = _ref4.symbol,
            derivationPath = _ref4.derivationPath,
            _ref4$isSegwit = _ref4.isSegwit,
            isSegwit = _ref4$isSegwit === undefined ? false : _ref4$isSegwit;

        var parentPath, _ref6, parentPubKey, response, pubKey, chainCode, xpub, getAddress;

        return regeneratorRuntime.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                parentPath = derivationPath.split('/').slice(0, -1).join('/');
                _context4.next = 3;
                return btc.getWalletPublicKey(parentPath);

              case 3:
                _ref6 = _context4.sent;
                parentPubKey = _ref6.publicKey;
                _context4.next = 7;
                return btc.getWalletPublicKey(derivationPath);

              case 7:
                response = _context4.sent;
                pubKey = response.publicKey, chainCode = response.chainCode;
                xpub = (0, _xpubjs.deriveExtendedPublicKey)({ symbol: symbol, derivationPath: derivationPath, pubKey: pubKey, chainCode: chainCode, parentPubKey: parentPubKey });

                getAddress = function getAddress(path) {
                  return (0, _xpubjs.deriveAddress)({ symbol: symbol, xpub: xpub, path: path, isSegwit: isSegwit });
                };

                return _context4.abrupt('return', { pubKey: pubKey, parentPubKey: parentPubKey, chainCode: chainCode, xpub: xpub, getAddress: getAddress, derivationPath: derivationPath });

              case 12:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this);
      }));

      function getBTCData(_x) {
        return _ref5.apply(this, arguments);
      }

      return getBTCData;
    }()
  }, {
    key: 'checkBTC',
    value: function () {
      var _ref7 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee5() {
        var btc, _ref8, address, symbol, derivationPath, data, isSegwit;

        return regeneratorRuntime.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                btc = new _hwAppBtc2.default(this.transport);
                _context5.next = 3;
                return btc.getWalletPublicKey("0'");

              case 3:
                _ref8 = _context5.sent;
                address = _ref8.bitcoinAddress;
                symbol = (0, _detectSymbol.detectSymbol)(address);
                derivationPath = defaultDerivationPath[symbol];
                data = {};

                if (!segwitSymbols.includes(symbol)) {
                  _context5.next = 19;
                  break;
                }

                _context5.next = 11;
                return this.getBTCData({ btc: btc, symbol: symbol, derivationPath: derivationPath });

              case 11:
                data.legacy = _context5.sent;

                derivationPath = derivationPath.replace("44'", "49'");
                isSegwit = true;
                _context5.next = 16;
                return this.getBTCData({ btc: btc, symbol: symbol, derivationPath: derivationPath, isSegwit: isSegwit });

              case 16:
                data.segwit = _context5.sent;
                _context5.next = 22;
                break;

              case 19:
                _context5.next = 21;
                return this.getBTCData({ btc: btc, symbol: symbol, derivationPath: derivationPath });

              case 21:
                data = _context5.sent;

              case 22:
                return _context5.abrupt('return', this.handleSymbol(symbol, data));

              case 23:
              case 'end':
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function checkBTC() {
        return _ref7.apply(this, arguments);
      }

      return checkBTC;
    }()
  }, {
    key: 'checkETH',
    value: function () {
      var _ref9 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee6() {
        var eth, derivationPath, data, symbol;
        return regeneratorRuntime.wrap(function _callee6$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                eth = new _hwAppEth2.default(this.transport);
                _context6.next = 3;
                return eth.getAppConfiguration();

              case 3:
                this.busy = false;

                if (!this.symbol) {
                  _context6.next = 6;
                  break;
                }

                return _context6.abrupt('return');

              case 6:
                this.busy = true;
                derivationPath = defaultDerivationPath.ETH + '/0';
                _context6.next = 10;
                return eth.getAddress(derivationPath, false, true);

              case 10:
                data = _context6.sent;
                symbol = (0, _detectSymbol.detectSymbol)(data.address);

                this.handleSymbol(symbol, data);

              case 13:
              case 'end':
                return _context6.stop();
            }
          }
        }, _callee6, this);
      }));

      function checkETH() {
        return _ref9.apply(this, arguments);
      }

      return checkETH;
    }()
  }]);

  return LedgerSDK;
}(_events2.default);

exports.default = LedgerSDK;


if (typeof window !== 'undefined') {
  window.LedgerSDK = LedgerSDK;
}

},{"./detectSymbol":615,"@ledgerhq/hw-app-btc":1,"@ledgerhq/hw-app-eth":3,"@ledgerhq/hw-transport-u2f":5,"babel-polyfill":11,"events":562,"xpubjs":613}]},{},[616]);
