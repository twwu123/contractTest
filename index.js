import * as CardanoWasm from "@emurgo/cardano-serialization-lib-browser";
import * as utils from "./utils.js"
import { Buffer } from "buffer";
import axios from "axios";

const onScreenAlert = document.getElementById("on-screen-alert")
const accessButton = document.getElementById("access-button")
const saveContractButton = document.getElementById("save-contract-button")
const getBalanceButton = document.getElementById("get-balance-button")
const mintTestNFTButton = document.getElementById("mint-test-NFT-button")
const addAssetButton = document.getElementById("add-asset-button")
const removeAssetButton = document.getElementById("remove-asset-button")
const addRedeemSendAssetButton = document.getElementById("add-redeem-send-asset-button")
const removeRedeemSendAssetButton = document.getElementById("remove-redeem-send-asset-button")
const addRedeemOutputButton = document.getElementById("add-redeem-output-button")
const submitSendButton = document.getElementById("submit-send-button")
const submitRedeemButton = document.getElementById("submit-redeem-button")

let yoroiBackendUrl = "https://testnet-backend.yoroiwallet.com/api/"
let api

accessButton.addEventListener('click', () => {
    if (!window.cardano.yoroi) {
        alert("Yoroi wallet not found! Please install it")
        return
    }
    window.cardano.yoroi.enable({ requestIdentification: document.getElementById("check-identification").checked })
        .then((connectApi))
        .catch((e) => {
            console.log(e)
            setOnScreenAlert(JSON.stringify(e), "danger")
        })
})

saveContractButton.addEventListener('click', () => {
    window.localStorage.setItem("contractAddress", document.getElementById("contract-address").value)
    window.localStorage.setItem("contractHex", document.getElementById("contract-hex").value)
    setOnScreenAlert("Contract saved", "success")
})

getBalanceButton.addEventListener('click', async () => {
    checkApiAvailable()
    const hexBalance = await api.getBalance()
    const wasmBalanceValue = CardanoWasm.Value.from_bytes(utils.hexToBytes(hexBalance))
    const wasmAssetPolicies = wasmBalanceValue.multiasset().keys()
    const assets = { "lovelaces": wasmBalanceValue.coin().to_str() }
    for (let i = 0; i < wasmAssetPolicies.len(); i++) {
        const policyId = utils.bytesToHex(wasmAssetPolicies.get(i).to_bytes())
        const wasmAssetNames = wasmBalanceValue.multiasset().get(wasmAssetPolicies.get(i)).keys()
        assets[policyId] = {}
        for (let j = 0; j < wasmAssetNames.len(); j++) {
            const assetValue = wasmBalanceValue.multiasset().get(wasmAssetPolicies.get(i)).get(wasmAssetNames.get(j)).to_str()
            const assetName = utils.bytesToHex(wasmAssetNames.get(j).name())
            assets[policyId][assetName] = assetValue
        }
    }
    const balanceAlert = document.getElementById("balance-alert")
    balanceAlert.textContent = JSON.stringify(assets, null, 2)
})

mintTestNFTButton.addEventListener('click', async () => {
    checkApiAvailable()
    const txBuilder = getTxBuilder()
    const hexInputUtxos = await api.getUtxos("2000000")
    const wasmTxInputsBuilder = CardanoWasm.TxInputsBuilder.new()
    let pubkeyHash
    for (let i = 0; i < hexInputUtxos.length; i++) {
        const wasmUtxo = CardanoWasm.TransactionUnspentOutput.from_bytes(utils.hexToBytes(hexInputUtxos[i]))
        wasmTxInputsBuilder.add_input(wasmUtxo.output().address(), wasmUtxo.input(), wasmUtxo.output().amount())
        pubkeyHash = CardanoWasm.BaseAddress.from_address(wasmUtxo.output().address()).payment_cred().to_keyhash()
    }
    txBuilder.set_inputs(wasmTxInputsBuilder)

    const hexChangeAddress = await api.getChangeAddress()
    const wasmChangeAddress = CardanoWasm.Address.from_bytes(utils.hexToBytes(hexChangeAddress))
    const wasmNativeScript = CardanoWasm.NativeScript.new_script_pubkey(CardanoWasm.ScriptPubkey.new(pubkeyHash))
    txBuilder.add_mint_asset_and_output_min_required_coin(wasmNativeScript,
        CardanoWasm.AssetName.new(Buffer.from("TNFT", "utf8")),
        CardanoWasm.Int.new_i32(1),
        CardanoWasm.TransactionOutputBuilder.new().with_address(wasmChangeAddress).next()
    )

    txBuilder.add_change_if_needed(wasmChangeAddress)

    const unsignedTransactionHex = utils.bytesToHex(txBuilder.build_tx().to_bytes())

    api.signTx(unsignedTransactionHex)
        .then((witnessSetHex) => {
            const wasmWitnessSet = CardanoWasm.TransactionWitnessSet.from_bytes(
                utils.hexToBytes(witnessSetHex)
            )
            const wasmTx = CardanoWasm.Transaction.from_bytes(
                utils.hexToBytes(unsignedTransactionHex)
            )
            const wasmSignedTransaction = CardanoWasm.Transaction.new(
                wasmTx.body(),
                wasmWitnessSet,
                wasmTx.auxiliary_data()
            )

            const transactionHex = utils.bytesToHex(wasmSignedTransaction.to_bytes())
            api.submitTx(transactionHex)
                .then(txId => {
                    setOnScreenAlert(`Transaction successfully submitted: ${txId}`, "success")
                })
                .catch(err => {
                    setOnScreenAlert(err, "danger")
                })
        }).catch(err => {
            setOnScreenAlert(err.info, "danger")
        })
})

addAssetButton.addEventListener('click', () => {
    const assetList = document.getElementById("asset-list")
    const newAssetElement = document.createElement("li")
    newAssetElement.id = `asset-element-${assetList.children.length - 1}`

    const newAssetDiv = document.createElement("div")
    newAssetDiv.className = "form-group"

    const newAssetRow = document.createElement("div")
    newAssetRow.className = "row"

    const assetNameDiv = document.createElement("div")
    assetNameDiv.className = "col-9"

    const assetNameInput = document.createElement("input")
    assetNameInput.className = "form-control"
    assetNameInput.placeholder = "<policyId>.<assetName>"
    assetNameInput.id = `asset-name-${assetList.children.length - 1}`

    const assetAmountDiv = document.createElement("div")
    assetAmountDiv.className = "col-3"

    const assetAmountInput = document.createElement("input")
    assetAmountInput.className = "form-control"
    assetAmountInput.placeholder = "amount"
    assetAmountInput.id = `asset-amount-${assetList.children.length - 1}`

    assetAmountDiv.appendChild(assetAmountInput)
    assetNameDiv.appendChild(assetNameInput)
    newAssetRow.appendChild(assetNameDiv)
    newAssetRow.appendChild(assetAmountDiv)
    newAssetDiv.appendChild(newAssetRow)
    newAssetElement.appendChild(newAssetDiv)
    assetList.appendChild(newAssetElement)
})

removeAssetButton.addEventListener('click', () => {
    const assetList = document.getElementById("asset-list")
    if (assetList.children.length == 1) {
        return
    }
    assetList.children.item(assetList.children.length - 1).remove()
})

submitSendButton.addEventListener('click', async () => {
    checkApiAvailable()
    const contractAddress = document.getElementById("contract-address").value
    const sendAmount = document.getElementById("send-amount").value
    const datum = document.getElementById("datum-json-send").value

    const txBuilder = getTxBuilder()

    const wasmValue = CardanoWasm.Value.new(CardanoWasm.BigNum.from_str(String(sendAmount)))
    const wasmMultiAsset = CardanoWasm.MultiAsset.new()
    const assetList = document.getElementById("asset-list").children
    for (let i = 1; i < assetList.length; i++) {
        const assetInputs = assetList[i].getElementsByTagName("input")
        const assetName = assetInputs[0].value
        const assetSendAmount = assetInputs[1].value
        const assetArray = assetName.split(".", 2)
        addAssetToWasmMultiAsset(assetArray[0], assetArray[1], assetSendAmount, wasmMultiAsset)
    }
    wasmValue.set_multiasset(wasmMultiAsset)

    const hexInputUtxos = await api.getUtxos(utils.bytesToHex(wasmValue.to_bytes()))
    const wasmTxInputsBuilder = CardanoWasm.TxInputsBuilder.new()
    for (let i = 0; i < hexInputUtxos.length; i++) {
        const wasmUtxo = CardanoWasm.TransactionUnspentOutput.from_bytes(utils.hexToBytes(hexInputUtxos[i]))
        wasmTxInputsBuilder.add_input(wasmUtxo.output().address(), wasmUtxo.input(), wasmUtxo.output().amount())
    }
    txBuilder.set_inputs(wasmTxInputsBuilder)

    let wasmDatum

    try {
        wasmDatum = jsonDataToWasmDatum(datum)
    } catch (err) {
        if (err == "") {
            setOnScreenAlert("Error occurred when parsing Datum, please check it", "danger")
        } else {
            setOnScreenAlert(err, "danger")
        }
        return
    }

    const plutusScriptAddress = CardanoWasm.Address.from_bech32(contractAddress)
    const scriptDataHash = CardanoWasm.hash_plutus_data(wasmDatum)
    const outputToScript = CardanoWasm.TransactionOutput.new(
        plutusScriptAddress,
        wasmValue
    )
    outputToScript.set_data_hash(scriptDataHash)
    txBuilder.add_output(outputToScript)

    const hexChangeAddress = await api.getChangeAddress()
    const wasmChangeAddress = CardanoWasm.Address.from_bytes(utils.hexToBytes(hexChangeAddress))
    txBuilder.add_change_if_needed(wasmChangeAddress)

    const unsignedTransactionHex = utils.bytesToHex(txBuilder.build_tx().to_bytes())

    api.signTx(unsignedTransactionHex)
        .then((witnessSetHex) => {
            const wasmWitnessSet = CardanoWasm.TransactionWitnessSet.from_bytes(
                utils.hexToBytes(witnessSetHex)
            )
            const wasmTx = CardanoWasm.Transaction.from_bytes(
                utils.hexToBytes(unsignedTransactionHex)
            )
            const wasmSignedTransaction = CardanoWasm.Transaction.new(
                wasmTx.body(),
                wasmWitnessSet,
                wasmTx.auxiliary_data()
            )

            // find the output to script so we can auto fill some of the redeem fields
            const wasmOutputs = wasmTx.body().outputs()
            for (let i = 0; i < wasmOutputs.len(); i++) {
                if (wasmOutputs.get(i).address().to_bech32() == contractAddress) {
                    document.getElementById("output-id").value = i
                    document.getElementById("transaction-hash").value = utils.bytesToHex(CardanoWasm.hash_transaction(wasmTx.body()).to_bytes())
                }
            }

            const transactionHex = utils.bytesToHex(wasmSignedTransaction.to_bytes())
            api.submitTx(transactionHex)
                .then(txId => {
                    setOnScreenAlert(`Transaction successfully submitted: ${txId}`, "success")
                })
                .catch(err => {
                    setOnScreenAlert(err, "danger")
                })
        }).catch(err => {
            setOnScreenAlert(err.info, "danger")
        })
})

addRedeemSendAssetButton.addEventListener('click', () => {
    const assetList = document.getElementById("redeem-asset-list")
    const newAssetElement = document.createElement("li")

    const newAssetDiv = document.createElement("div")
    newAssetDiv.className = "form-group"

    const newAssetRow = document.createElement("div")
    newAssetRow.className = "row"

    const assetNameDiv = document.createElement("div")
    assetNameDiv.className = "col-9"

    const assetNameInput = document.createElement("input")
    assetNameInput.className = "form-control"
    assetNameInput.placeholder = "<policyId>.<assetName>"

    const assetAmountDiv = document.createElement("div")
    assetAmountDiv.className = "col-3"

    const assetAmountInput = document.createElement("input")
    assetAmountInput.className = "form-control"
    assetAmountInput.placeholder = "amount"

    assetAmountDiv.appendChild(assetAmountInput)
    assetNameDiv.appendChild(assetNameInput)
    newAssetRow.appendChild(assetNameDiv)
    newAssetRow.appendChild(assetAmountDiv)
    newAssetDiv.appendChild(newAssetRow)
    newAssetElement.appendChild(newAssetDiv)
    assetList.appendChild(newAssetElement)
})

removeRedeemSendAssetButton.addEventListener('click', () => {
    const assetList = document.getElementById("redeem-asset-list")
    if (assetList.children.length == 1) {
        return
    }
    assetList.children.item(assetList.children.length - 1).remove()
})

addRedeemOutputButton.addEventListener('click', () => {
    const sendAddress = document.getElementById("redeem-send-address").value
    const assetList = document.getElementById("redeem-asset-list")
    const lovelaceValue = assetList.children[0].getElementsByTagName("input")[0].value
    const sendAssets = []
    for (let i = 1; i < assetList.children.length; i++) {
        const assetRow = assetList.children[i].getElementsByTagName("input")
        const assetName = assetRow[0].value
        const assetValue = assetRow[1].value
        sendAssets.push([assetName, assetValue])
    }

    const transactionInfo = {
        "address": sendAddress,
        "lovelaceValue": lovelaceValue,
        "assets": sendAssets
    }

    const extraOutputList = document.getElementById("extra-output-list")

    const extraOutputRow = document.createElement("li")
    extraOutputRow.className = "row px-0 py-1"
    const outputTextArea = document.createElement("textarea")
    outputTextArea.className = "col-9"
    outputTextArea.value = JSON.stringify(transactionInfo, null, 2)

    const removeButton = document.createElement("button")
    removeButton.className = "col-3 btn btn-danger"
    removeButton.type = "button"
    removeButton.textContent = "Delete"

    removeButton.addEventListener('click', () => {
        extraOutputRow.remove()
    })

    extraOutputRow.appendChild(outputTextArea)
    extraOutputRow.appendChild(removeButton)
    extraOutputList.appendChild(
        extraOutputRow
    )
})

submitRedeemButton.addEventListener('click', async () => {
    checkApiAvailable()

    const transactionHash = document.getElementById("transaction-hash").value
    const outputId = document.getElementById("output-id").value
    const plutusScriptHex = document.getElementById("contract-hex").value
    const datum = document.getElementById("datum-json-redeem").value
    const redeemer = document.getElementById("redeemer-json").value

    const txBuilder = getTxBuilder()

    // get script input
    const txResponse = await axios.post(
        `${yoroiBackendUrl}v2/txs/get`,
        {
            txHashes: [transactionHash]
        }
    )
    const txHashes = Object.keys(txResponse.data)
    const inputUtxo = txResponse.data[txHashes[0]]["outputs"][outputId]

    const wasmTxInputsBuilder = CardanoWasm.TxInputsBuilder.new()

    // get user input datum and redeemer
    let wasmDatum
    let wasmRedeemerData

    try {
        wasmDatum = jsonDataToWasmDatum(datum)
        wasmRedeemerData = jsonDataToWasmDatum(redeemer)
    } catch (err) {
        if (err == "") {
            setOnScreenAlert("Error occurred when parsing Datum, please check it", "danger")
        } else {
            setOnScreenAlert(err, "danger")
        }
        return
    }

    // build script input witness
    const wasmRedeemer = CardanoWasm.Redeemer.new(
        CardanoWasm.RedeemerTag.new_spend(),
        CardanoWasm.BigNum.zero(),
        wasmRedeemerData,
        CardanoWasm.ExUnits.new(
            CardanoWasm.BigNum.from_str('8000'),
            CardanoWasm.BigNum.from_str('9764680'),
        )
    )
    const plutusScriptWitness = CardanoWasm.PlutusWitness.new(
        CardanoWasm.PlutusScript.from_bytes(utils.hexToBytes(plutusScriptHex)),
        wasmDatum,
        wasmRedeemer
    )

    const wasmTxInput = CardanoWasm.TransactionInput.new(
        CardanoWasm.TransactionHash.from_bytes(
            utils.hexToBytes(
                transactionHash
            )
        ),
        outputId
    )

    // build script input value
    const wasmValue = CardanoWasm.Value.new(CardanoWasm.BigNum.from_str(inputUtxo.amount))
    const wasmMultiAsset = CardanoWasm.MultiAsset.new()
    for (let i = 0; i < inputUtxo.assets.length; i++) {
        const assetName = inputUtxo.assets[i].assetId
        const assetSendAmount = inputUtxo.assets[i].amount
        const assetArray = assetName.split(".", 2)
        addAssetToWasmMultiAsset(assetArray[0], assetArray[1], assetSendAmount, wasmMultiAsset)
    }
    wasmValue.set_multiasset(wasmMultiAsset)
    wasmTxInputsBuilder.add_plutus_script_input(plutusScriptWitness, wasmTxInput, wasmValue)

    // we put some extra value in so that we can pay fees also
    const extraWasmValue = CardanoWasm.Value.new(CardanoWasm.BigNum.from_str("2000000"))
    const extraOutputs = document.getElementById("extra-output-list").getElementsByTagName("textarea")
    const extraOutputsList = []
    for (let i = 0; i < extraOutputs.length; i++) {
        extraOutputsList.push(JSON.parse(extraOutputs[i].value))
    }

    console.log(extraOutputsList)

    // loop through every extra output and put it in the extra value, and also add the output to tx builder
    for (let i = 0; i < extraOutputsList.length; i++) {
        const output = extraOutputsList[i]
        const outputWasmValue = CardanoWasm.Value.new(CardanoWasm.BigNum.from_str(output.lovelaceValue))
        const outputWasmMultiAsset = CardanoWasm.MultiAsset.new()
        for (let j = 0; j < output.assets.length; j++) {
            const outputAssetName = output.assets[i][0]
            const outputAssetSendAmount = output.assets[i][1]
            const outputAssetArray = outputAssetName.split(".", 2)
            addAssetToWasmMultiAsset(outputAssetArray[0], outputAssetArray[1], outputAssetSendAmount, outputWasmMultiAsset)
        }
        outputWasmValue.set_multiasset(wasmMultiAsset)

        txBuilder.add_output(CardanoWasm.TransactionOutput.new(
            CardanoWasm.Address.from_bech32(output.address),
            outputWasmValue
        ))
        // we add the required funds into the extra value
        extraWasmValue.checked_add(outputWasmValue)
    }

    // then we need to include inputs for the extra value
    const hexInputUtxos = await api.getUtxos(utils.bytesToHex(extraWasmValue.to_bytes()))
    for (let i = 0; i < hexInputUtxos.length; i++) {
        const wasmUtxo = CardanoWasm.TransactionUnspentOutput.from_bytes(utils.hexToBytes(hexInputUtxos[i]))
        wasmTxInputsBuilder.add_input(wasmUtxo.output().address(), wasmUtxo.input(), wasmUtxo.output().amount())
    }

    txBuilder.set_inputs(wasmTxInputsBuilder)

    // we need to set some collateral also
    const hexCollateralUtxos = await api.getCollateral(3000000)
    const collateralTxInputsBuilder = CardanoWasm.TxInputsBuilder.new()
    for (let i = 0; i < hexCollateralUtxos.length; i++) {
        const wasmUtxo = CardanoWasm.TransactionUnspentOutput.from_bytes(utils.hexToBytes(hexCollateralUtxos[i]))
        collateralTxInputsBuilder.add_input(wasmUtxo.output().address(), wasmUtxo.input(), wasmUtxo.output().amount())
    }
    txBuilder.set_collateral(collateralTxInputsBuilder)

    // handle change
    const hexChangeAddress = await api.getChangeAddress()
    const wasmChangeAddress = CardanoWasm.Address.from_bytes(utils.hexToBytes(hexChangeAddress))
    txBuilder.add_change_if_needed(wasmChangeAddress)

    // this handles all hashing of plutus witnesses
    txBuilder.calc_script_data_hash(CardanoWasm.TxBuilderConstants.plutus_default_cost_models())

    const unsignedTransactionHex = utils.bytesToHex(txBuilder.build_tx().to_bytes())

    api.signTx(unsignedTransactionHex)
        .then((witnessSetHex) => {
            const wasmWitnessSet = CardanoWasm.TransactionWitnessSet.from_bytes(
                utils.hexToBytes(witnessSetHex)
            )
            const wasmTx = CardanoWasm.Transaction.from_bytes(
                utils.hexToBytes(unsignedTransactionHex)
            )
            const wasmSignedTransaction = CardanoWasm.Transaction.new(
                wasmTx.body(),
                wasmWitnessSet,
                wasmTx.auxiliary_data()
            )
            const transactionHex = utils.bytesToHex(wasmSignedTransaction.to_bytes())
            api.submitTx(transactionHex)
                .then(txId => {
                    setOnScreenAlert(`Transaction successfully submitted: ${txId}`, "success")
                })
                .catch(err => {
                    setOnScreenAlert(err.info, "danger")
                })
        }).catch(err => {
            console.log(err.info)
            setOnScreenAlert(err.info, "danger")
        })
})

const addAssetToWasmMultiAsset = (policyId, assetName, amount, multiasset) => {
    const wasmAssets = CardanoWasm.Assets.new()
    wasmAssets.insert(CardanoWasm.AssetName.new(utils.hexToBytes(assetName)), CardanoWasm.BigNum.from_str(String(amount)))
    multiasset.insert(CardanoWasm.ScriptHash.from_bytes(utils.hexToBytes(policyId)), wasmAssets)
}

const getTxBuilder = () => {
    return CardanoWasm.TransactionBuilder.new(
        CardanoWasm.TransactionBuilderConfigBuilder.new()
            // all of these are taken from the mainnet genesis settings
            // linear fee parameters (a*size + b)
            .fee_algo(
                CardanoWasm.LinearFee.new(
                    CardanoWasm.BigNum.from_str("44"),
                    CardanoWasm.BigNum.from_str("155381")
                )
            )
            .coins_per_utxo_word(CardanoWasm.BigNum.from_str('34482'))
            .pool_deposit(CardanoWasm.BigNum.from_str('500000000'))
            .key_deposit(CardanoWasm.BigNum.from_str('2000000'))
            .ex_unit_prices(CardanoWasm.ExUnitPrices.new(
                CardanoWasm.UnitInterval.new(CardanoWasm.BigNum.from_str("721"), CardanoWasm.BigNum.from_str("10000000")),
                CardanoWasm.UnitInterval.new(CardanoWasm.BigNum.from_str("577"), CardanoWasm.BigNum.from_str("10000"))
            ))
            .max_value_size(5000)
            .max_tx_size(16384)
            .build()
    );
}

const checkApiAvailable = () => {
    if (!api) {
        setOnScreenAlert("Please request access", "danger")
        throw "Access not available"
    }
}

const jsonDataToWasmDatum = (data) => {
    if (data == "") {
        setOnScreenAlert("Empty Datum isn't allowed")
        throw ("Empty Datum")
    }
    const dataObj = (typeof (data) == "string") ? JSON.parse(data) : data
    const keys = Object.keys(dataObj)
    switch (keys[0]) {
        case "fields":
            if (!dataObj.constructor) {
                setOnScreenAlert("Fields datum doesn't have a constructor property", "danger")
                return
            }
            if (dataObj.fields.length == 0) {
                return CardanoWasm.PlutusData.new_empty_constr_plutus_data(CardanoWasm.BigNum.from_str(String(dataObj.constructor)))
            } else {
                const plutusList = CardanoWasm.PlutusList.new()
                for (let i = 0; i < dataObj.fields.length; i++) {
                    plutusList.add(jsonDataToWasmDatum(dataObj.fields[i]))
                }
                return CardanoWasm.PlutusData.new_constr_plutus_data(
                    CardanoWasm.ConstrPlutusData.new(
                        CardanoWasm.BigNum.from_str(String(dataObj.constructor)),
                        plutusList
                    )
                )
            }
        case "constructor":
            if (!dataObj.fields) {
                setOnScreenAlert("Constructor datum doesn't have a fields property", "danger")
                return
            }
            if (dataObj.fields.length == 0) {
                return CardanoWasm.PlutusData.new_empty_constr_plutus_data(CardanoWasm.BigNum.from_str(String(dataObj.constructor)))
            } else {
                const plutusList = CardanoWasm.PlutusList.new()
                for (let i = 0; i < dataObj.fields.length; i++) {
                    plutusList.add(jsonDataToWasmDatum(dataObj.fields[i]))
                }
                return CardanoWasm.PlutusData.new_constr_plutus_data(
                    CardanoWasm.ConstrPlutusData.new(
                        CardanoWasm.BigNum.from_str(String(dataObj.constructor)),
                        plutusList
                    )
                )
            }
        case "list":
            const plutusList = CardanoWasm.PlutusList.new()
            for (let i = 0; i < dataObj.list.length; i++) {
                plutusList.add(jsonDataToWasmDatum(dataObj.list))
            }
            return CardanoWasm.PlutusData.new_list(plutusList)
        case "map":
            if (dataObj.map.constructor.name == "Array") {
                const plutusList = CardanoWasm.PlutusList.new()
                for (let i = 0; i < dataObj.map.length; i++) {
                    const plutusMap = CardanoWasm.PlutusMap.new()
                    plutusMap.insert(jsonDataToWasmDatum(dataObj.map[i]["k"]), jsonDataToWasmDatum(dataObj.map[i]["v"]))
                    plutusList.add(CardanoWasm.PlutusData.new_map(plutusMap))
                }
                return CardanoWasm.PlutusData.new_list(plutusList)
            } else {
                const plutusMap = CardanoWasm.PlutusMap.new()
                plutusMap.insert(jsonDataToWasmDatum(dataObj.map["k"]), jsonDataToWasmDatum(dataObj.map["v"]))
                return CardanoWasm.PlutusData.new_map(plutusMap)
            }
        case "int":
            return CardanoWasm.PlutusData.new_integer(CardanoWasm.BigInt.from_str(String(dataObj.int)))
        case "bytes":
            return CardanoWasm.PlutusData.new_bytes(utils.hexToBytes(dataObj.bytes))
        default:
            setOnScreenAlert("Unknown data type detected, datum is probably incorrect", "danger")
            throw ("Invalid Datum")
    }
}

const setOnScreenAlert = (text, type) => {
    onScreenAlert.className = `alert alert-${type} w-100 overflow-auto`
    if (Array.isArray(text)) {
        for (let i = 0; i < text.length; i++) {
            text[i] += " \n"
        }
    }
    onScreenAlert.textContent = text
}

const connectApi = (yoroiApi) => {
    api = yoroiApi
    document.getElementById("access-row").className = "d-none"
    setOnScreenAlert("Wallet Connected", "success")
}

const silentConnect = () => {
    if (!window.cardano.yoroi) {
        setOnScreenAlert("Yoroi not found", "danger")
        return
    }
    window.cardano.yoroi.enable({ requestionIdentification: true, onlySilent: true })
        .then(connectApi)
        .catch((e) => {
            console.log(e)
        })
}

const getSavedContract = () => {
    document.getElementById("contract-address").value = window.localStorage.getItem("contractAddress")
    document.getElementById("contract-hex").value = window.localStorage.getItem("contractHex")
}

const load = () => {
    silentConnect()
    getSavedContract()
}

load()