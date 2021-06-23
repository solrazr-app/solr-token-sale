import {
  Account,
} from '@solana/web3.js'
import fs from 'mz/fs'

export async function keypairTest() {

  const keypairFile = "./keypair.json";

  if(fs.existsSync(keypairFile)) {
    console.log("The file",keypairFile,"already exists.");
    process.exit(1);
  } 

  console.log("-----");
  console.log("Making new keypair");
  console.log();
  
  const wallet = new Account();

  const sk = wallet.secretKey.slice(0,32);
  const pk = wallet.secretKey.slice(32);
  const hex = wallet.publicKey._bn;
  const address = wallet.publicKey.toBase58();

  console.log("SK in bytes:", sk);
  console.log("PK in bytes:", pk);
  console.log("PK as hex str:", hex);
  console.log("PK as base58 ('the address'):", address);

  // Uint8Array to JSON is problematic
  var tmpArr = []; 
  for(var p in Object.getOwnPropertyNames(wallet.secretKey)) {
    tmpArr[p] = wallet.secretKey[p];
  }

  fs.writeFileSync(keypairFile, JSON.stringify(tmpArr));

  // check it
  console.log("Creating new account with secretkey");
  const checkSecret = JSON.parse(await fs.readFile(keypairFile));
  const checkWallet = new Account(checkSecret);

  console.log(checkWallet.toString());

  if (checkWallet.publicKey.toBase58() !== address) {
    console.log("Something went wrong");
    process.exit(1);
  }

  console.log("Wallet keypair is in root of project:", keypairFile)
  console.log("-----")
}