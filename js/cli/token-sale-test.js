// @flow

import BN from 'bn.js';
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
import {
  TokenSale,
  TOKEN_SALE_ACCOUNT_DATA_LAYOUT,
  TokenSaleLayout,
} from '../client/token-sale';
import {newAccountWithLamports} from '../client/util/new-account-with-lamports';
import {url} from '../url';
import {sleep} from '../client/util/sleep';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  TOKEN_SALE_PROGRAM_ID,
  TOKEN_WHITELIST_PROGRAM_ID,
  tokenWhitelistMap,
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

// Mint amounts
let mintAmountUSDT = 100000;
let mintAmountSOLR = 100000000;

const DECIMAL_MULTIPLIER = 1000000;
const INIT_FUND_AMOUNT = 1000000*DECIMAL_MULTIPLIER;
const USD_MIN_AMOUNT = 100*DECIMAL_MULTIPLIER;
const USD_MAX_AMOUNT = 500*DECIMAL_MULTIPLIER;
const FUND_AMOUNT = 1000000*DECIMAL_MULTIPLIER;
const PURCHASE_AMOUNT = 250*DECIMAL_MULTIPLIER;
const SALE_PRICE = 0.1;
const SALE_TIMESTAMP = Math.floor(Date.now()/1000) + 30; // setting sale time to 30secs from now...

function assert(condition, message) {
  if (!condition) {
    console.log(Error().stack + ':token-sale-test.js');
    throw message || 'Assertion failed';
  }
}

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

  console.log('creating token USDT account');
  poolTokenAccountUSDT = await mintUSDT.createAccount(ownerPool.publicKey);

  console.log('creating token SOLR account');
  saleTokenAccountSOLR = await mintSOLR.createAccount(ownerPool.publicKey);

  tokenSale = await TokenSale.createTokenSale(
    connection,
    payer,
    mintUSDT.publicKey,
    mintSOLR.publicKey,
    tokenWhitelistMap,
    TOKEN_SALE_PROGRAM_ID,
    TOKEN_WHITELIST_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  );

  assert(tokenSale.payer.publicKey.toString() == payer.publicKey.toString());
  assert(tokenSale.mintUSDTPubkey.toString() == mintUSDT.publicKey.toString());
  assert(tokenSale.mintSOLRPubkey.toString() == mintSOLR.publicKey.toString());
  assert(tokenSale.tokenWhitelistMap.toString() == tokenWhitelistMap.toString());
  assert(tokenSale.tokenSaleProgramId.toString() == TOKEN_SALE_PROGRAM_ID.toString());
  assert(tokenSale.tokenWhitelistProgramId.toString() == TOKEN_WHITELIST_PROGRAM_ID.toString());
  assert(tokenSale.tokenProgramId.toString() == TOKEN_PROGRAM_ID.toString());
  assert(tokenSale.associatedProgramId.toString() == ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID.toString());

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

  assert(tokenSale.tokenSaleAccount != null);
  let tokenSaleState;
  try {
      let tokenSaleInfo = await connection.getAccountInfo(tokenSale.tokenSaleAccount.publicKey, 'singleGossip');
      tokenSaleState = tokenSaleInfo.data;
  } catch (err) {
      throw new Error("Could not find token sale account at given address!");
  }
  const tokenSaleLayout = TOKEN_SALE_ACCOUNT_DATA_LAYOUT.decode(tokenSaleState);
  assert(tokenSaleLayout.isInitialized);
  assert(payer.publicKey.toBase58() == new PublicKey(tokenSaleLayout.initPubkey).toBase58());
  assert(saleTokenAccountSOLR.toBase58() == new PublicKey(tokenSaleLayout.saleTokenAccountPubkey).toBase58());
  assert(poolTokenAccountUSDT.toBase58() == new PublicKey(tokenSaleLayout.poolTokenAccountPubkey).toBase58());
  assert(tokenWhitelistMap.toBase58() == new PublicKey(tokenSaleLayout.whitelistMapPubkey).toBase58());
  assert(TOKEN_WHITELIST_PROGRAM_ID.toBase58() == new PublicKey(tokenSaleLayout.whitelistProgramPubkey).toBase58());
  assert(INIT_FUND_AMOUNT == new BN(tokenSaleLayout.tokenSaleAmount, 10, "le").toNumber());
  assert(USD_MIN_AMOUNT == new BN(tokenSaleLayout.minAmount, 10, "le").toNumber());
  assert(USD_MAX_AMOUNT == new BN(tokenSaleLayout.maxAmount, 10, "le").toNumber());
  assert((1/SALE_PRICE) == new BN(tokenSaleLayout.tokenSalePrice, 10, "le").toNumber());
  assert(SALE_TIMESTAMP == new BN(tokenSaleLayout.tokenSaleTime, 10, "le").toNumber());
}

export async function FundTokenSale(): Promise<void> {
  const connection = await getConnection();

  console.log('creating token SOLR account');
  poolTokenAccountSOLR = await mintSOLR.createAccount(ownerPool.publicKey);
  console.log('minting token SOLR for sale');
  await mintSOLR.mintTo(poolTokenAccountSOLR, mintAuthority, [], mintAmountSOLR);
  
  console.log('Fund Sale');
  await tokenSale.fundTokenSale(
    ownerPool,
    poolTokenAccountSOLR,
    saleTokenAccountSOLR,
    FUND_AMOUNT,
  );

  await sleep(500);

  let poolSOLRBalance = (await mintSOLR.getAccountInfo(poolTokenAccountSOLR)).amount.toNumber();
  assert(poolSOLRBalance == (mintAmountSOLR - FUND_AMOUNT));
  let saleSOLRBalance = (await mintSOLR.getAccountInfo(saleTokenAccountSOLR)).amount.toNumber();
  assert(saleSOLRBalance == FUND_AMOUNT);
}

export async function ExecuteTokenSale(): Promise<void> {
  const connection = await getConnection();
  const ownerUser = await newAccountWithLamports(connection, 1000000000);

  console.log('creating token USDT account');
  userTokenAccountUSDT = await mintUSDT.createAccount(ownerUser.publicKey);
  console.log('minting token USDT to sale');
  await mintUSDT.mintTo(userTokenAccountUSDT, mintAuthority, [], mintAmountUSDT);

  console.log('creating token SOLR account');
  userTokenAccountSOLR = await mintSOLR.createAccount(ownerUser.publicKey);

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

  let userUSDTBalance = (await mintUSDT.getAccountInfo(userTokenAccountUSDT)).amount.toNumber();
  assert(userUSDTBalance == (mintAmountUSDT - PURCHASE_AMOUNT));
  let poolUSDTBalance = (await mintUSDT.getAccountInfo(poolTokenAccountUSDT)).amount.toNumber();
  assert(poolUSDTBalance == PURCHASE_AMOUNT);
  let userSOLRBalance = (await mintSOLR.getAccountInfo(userTokenAccountSOLR)).amount.toNumber();
  assert(userSOLRBalance == (PURCHASE_AMOUNT/SALE_PRICE);
  let poolSOLRBalance = (await mintSOLR.getAccountInfo(saleTokenAccountSOLR)).amount.toNumber();
  assert(poolSOLRBalance == (mintAmountUSDT - (PURCHASE_AMOUNT/SALE_PRICE)));
}
