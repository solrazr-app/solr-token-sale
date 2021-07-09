// @flow

import {
  Account,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  AccountLayout,
  Token,
} from '@solana/spl-token';
import {TokenSale} from '../client/token-sale';
import {newAccountWithLamports} from '../client/util/new-account-with-lamports';
import {url} from '../url';
import {sleep} from '../client/util/sleep';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  TOKEN_SALE_PROGRAM_ID,
  TOKEN_WHITELIST_PROGRAM_ID,
  tokenWhitelistAccount,
} from '../client/pubkeys';

// Token sale
let tokenSale: TokenSale;
// ownerPool of the pool accounts
let ownerPool: Account;
// ownerUser of the user accounts
let ownerUser: Account;
// mintAuthority of the usdt mint
let mintAuthority: Account;
// Token mints & accounts
let mintUSDT: Token;
let mintSOLR: Token;
let userTokenAccountUSDT: PublicKey;
let userTokenAccountSOLR: PublicKey;
let poolTokenAccountUSDT: PublicKey;
let poolTokenAccountSOLR: PublicKey;
let saleTokenAccountSOLR: PublicKey;

// Initial amount in each sale token
let currentSaleTokenUSDT = 100000;
let currentSaleTokenSOLR = 100000000;

const DECIMAL_MULTIPLIER = 1000000;
const INIT_FUND_AMOUNT = 1000000*DECIMAL_MULTIPLIER;
const USD_MIN_AMOUNT = 100*DECIMAL_MULTIPLIER;
const USD_MAX_AMOUNT = 500*DECIMAL_MULTIPLIER;
const FUND_AMOUNT = 1000000*DECIMAL_MULTIPLIER;
const PURCHASE_AMOUNT = 250*DECIMAL_MULTIPLIER;
const SALE_PRICE = 0.1;
const SALE_TIMESTAMP = Math.floor(Date.now()/1000) + 30; // setting sale time to 30secs from now...

// function assert(condition, message) {
//   if (!condition) {
//     console.log(Error().stack + ':token-sale-test.js');
//     throw message || 'Assertion failed';
//   }
// }

let connection;
async function getConnection(): Promise<Connection> {
  if (connection) return connection;

  connection = new Connection(url, 'recent');
  const version = await connection.getVersion();

  console.log('Connection to cluster established:', url, version);
  return connection;
}

export async function InitTokenSale(): Promise<void> {
  const connection = await getConnection();
  const payer = await newAccountWithLamports(connection, 1000000000);
  mintAuthority = payer;
  ownerPool = payer;

  console.log('creating token USDT');
  mintUSDT = await Token.createMint(
    connection,
    payer,
    mintAuthority.publicKey,
    null,
    6,
    TOKEN_PROGRAM_ID,
  );
  mintUSDT.associatedProgramId = ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID;
  console.log('>>>>> mintUSDT PublicKey: ', mintUSDT.publicKey.toString());
  
  console.log('creating token SOLR');
  mintSOLR = await Token.createMint(
    connection,
    payer,
    mintAuthority.publicKey,
    null,
    6,
    TOKEN_PROGRAM_ID,
  );
  mintSOLR.associatedProgramId = ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID;
  console.log('>>>>> mintSOLR PublicKey: ', mintSOLR.publicKey.toString());

  console.log('creating token USDT accounts');
  poolTokenAccountUSDT = await mintUSDT.createAccount(ownerPool.publicKey);
  console.log('>>>>> Pool USDT Account: ', poolTokenAccountUSDT.toString());

  console.log('creating token SOLR accounts');
  saleTokenAccountSOLR = await mintSOLR.createAccount(ownerPool.publicKey);
  console.log('>>>>> Sale SOLR Account: ', saleTokenAccountSOLR.toString());

  tokenSale = await TokenSale.createTokenSale(
    connection,
    payer,
    mintUSDT.publicKey,
    mintSOLR.publicKey,
    tokenWhitelistAccount,
    TOKEN_SALE_PROGRAM_ID,
    TOKEN_WHITELIST_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  );

  console.log('Init Sale');
  await tokenSale.initTokenSale(
    ownerPool,
    poolTokenAccountUSDT,
    saleTokenAccountSOLR,
    INIT_FUND_AMOUNT,
    USD_MIN_AMOUNT,
    USD_MAX_AMOUNT,
    SALE_PRICE,
    SALE_TIMESTAMP,
  );

  await sleep(500);

  console.log('>>>>> Sale SOLR Account Balance: ', (await mintSOLR.getAccountInfo(saleTokenAccountSOLR)).amount.toNumber());
}

export async function FundTokenSale(): Promise<void> {
  const connection = await getConnection();

  console.log('creating token SOLR accounts');
  poolTokenAccountSOLR = await mintSOLR.createAccount(ownerPool.publicKey);
  console.log('>>>>> Pool SOLR Account: ', poolTokenAccountSOLR.toString());
  console.log('minting token SOLR for sale');
  await mintSOLR.mintTo(poolTokenAccountSOLR, mintAuthority, [], currentSaleTokenSOLR);
  console.log('>>>>> Pool SOLR Account Balance: ', (await mintSOLR.getAccountInfo(poolTokenAccountSOLR)).amount.toNumber());
  
  console.log('Fund Sale');
  await tokenSale.fundTokenSale(
    ownerPool,
    poolTokenAccountSOLR,
    saleTokenAccountSOLR,
    FUND_AMOUNT,
  );

  await sleep(500);

  console.log('>>>>> Pool SOLR Account Balance: ', (await mintSOLR.getAccountInfo(poolTokenAccountSOLR)).amount.toNumber());
  console.log('>>>>> Sale SOLR Account Balance: ', (await mintSOLR.getAccountInfo(saleTokenAccountSOLR)).amount.toNumber());
}

export async function ExecuteTokenSale(): Promise<void> {
  const connection = await getConnection();
  const ownerUser = await newAccountWithLamports(connection, 1000000000);

  console.log('creating token USDT accounts');
  userTokenAccountUSDT = await mintUSDT.createAccount(ownerUser.publicKey);
  console.log('>>>>> User USDT Account: ', userTokenAccountUSDT.toString());
  console.log('minting token USDT to sale');
  await mintUSDT.mintTo(userTokenAccountUSDT, mintAuthority, [], currentSaleTokenUSDT);
  console.log('>>>>> User USDT Account Balance: ', (await mintUSDT.getAccountInfo(userTokenAccountUSDT)).amount.toNumber());

  console.log('creating token SOLR accounts');
  userTokenAccountSOLR = await mintSOLR.createAccount(ownerUser.publicKey);
  console.log('>>>>> User SOLR Account: ', userTokenAccountSOLR.toString());
  console.log('>>>>> User SOLR Account Balance: ', (await mintSOLR.getAccountInfo(userTokenAccountSOLR)).amount.toNumber());

  // This needs to be updated with the token whitelist account
  const tokenWhitelistAccount = new PublicKey('XXXX'); // generated from token whitelist program

  console.log('Execute Sale');
  await tokenSale.executeTokenSale(
    ownerUser,
    userTokenAccountUSDT,
    userTokenAccountSOLR,
    saleTokenAccountSOLR,
    poolTokenAccountUSDT,
    tokenWhitelistAccount,
    PURCHASE_AMOUNT,
  );

  await sleep(500);

  console.log('>>>>> User USDT Account Balance: ', (await mintUSDT.getAccountInfo(userTokenAccountUSDT)).amount.toNumber());
  console.log('>>>>> Pool USDT Account Balance: ', (await mintUSDT.getAccountInfo(poolTokenAccountUSDT)).amount.toNumber());
  console.log('>>>>> User SOLR Account Balance: ', (await mintSOLR.getAccountInfo(userTokenAccountSOLR)).amount.toNumber());
  console.log('>>>>> Sale SOLR Account Balance: ', (await mintSOLR.getAccountInfo(saleTokenAccountSOLR)).amount.toNumber());
}
