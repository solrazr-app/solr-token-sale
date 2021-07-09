/**
 * @flow
 */

import assert from 'assert';
import BN from 'bn.js';
import {Buffer} from 'buffer';
import * as BufferLayout from 'buffer-layout';
import type {
  Connection,
  TransactionSignature,
} from '@solana/web3.js';
import {
  Account,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';

import * as Layout from './layout';
import {sendAndConfirmTransaction} from './util/send-and-confirm-transaction';
import {findAssociatedTokenAddress} from './util/create-associated-account';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  TOKEN_SALE_PROGRAM_ID,
  TOKEN_WHITELIST_PROGRAM_ID,
} from './pubkeys';

/**
 * Some amount of tokens
 */
export class Numberu64 extends BN {
  /**
   * Convert to Buffer representation
   */
  toBuffer(): typeof Buffer {
    const a = super.toArray().reverse();
    const b = Buffer.from(a);
    if (b.length === 8) {
      return b;
    }
    assert(b.length < 8, 'Numberu64 too large');

    const zeroPad = Buffer.alloc(8);
    b.copy(zeroPad);
    return zeroPad;
  }

  /**
   * Construct a Numberu64 from Buffer representation
   */
  static fromBuffer(buffer: typeof Buffer): Numberu64 {
    assert(buffer.length === 8, `Invalid buffer length: ${buffer.length}`);
    return new Numberu64(
      [...buffer]
        .reverse()
        .map(i => `00${i.toString(16)}`.slice(-2))
        .join(''),
      16,
    );
  }
}

/**
 * A program to exchange tokens against a pool of liquidity
 */
export class TokenSale {
  /**
   * @private
   */
  connection: Connection;

  /**
   * Fee payer
   */
  payer: Account; // must be used only for init and fund

  /**
   * USDT Token Pubkey
   */
  mintUSDTPubkey: PublicKey;

  /**
   * SOLR Token Pubkey
   */
  mintSOLRPubkey: PublicKey;

  /**
   * Token Sale Account
   */
  tokenSaleAccount: Account;

  /**
   * Token Whitelist Map Publickey
   */
  tokenWhitelistMap: PublicKey;

  /**
   * Program Identifier for the Token Sale program
   */
  tokenSaleProgramId: PublicKey;

  /**
   * Program Identifier for the Token Whitelist program
   */
  tokenWhitelistProgramId: PublicKey;

  /**
   * Program Identifier for the Token program
   */
  tokenProgramId: PublicKey;

  /**
   * Program Identifier for the Associated Token program
   */
  associatedProgramId: PublicKey;

  /**
   * Create a Token object attached to the specific token
   *
   * @param connection The connection to use
   * @param payer Pays for the transaction
   * @param mintUSDTPubkey USDT mint
   * @param mintSOLRPubkey SOLR mint
   * @param tokenSaleAccount Account to store token sale info
   * @param tokenWhitelistMap Publickey of the account storing token whitelist map
   * @param tokenSaleProgramId The program ID of the token-sale program
   * @param tokenWhitelistProgramId The program ID of the token-sale program
   * @param tokenProgramId The program ID of the token program
   * @param associatedProgramId The program ID of the associated token account program
   */
  constructor(
    connection: Connection,
    payer: Account,
    mintUSDTPubkey: PublicKey,
    mintSOLRPubkey: PublicKey,
    tokenSaleAccount: Account,
    tokenWhitelistMap: PublicKey,
    tokenSaleProgramId: PublicKey,
    tokenWhitelistProgramId: PublicKey,
    tokenProgramId: PublicKey,
    associatedProgramId: PublicKey,
  ) {
    Object.assign(this, {
      connection,
      payer,
      mintUSDTPubkey,
      mintSOLRPubkey,
      tokenSaleAccount,
      tokenWhitelistMap,
      tokenSaleProgramId,
      tokenWhitelistProgramId,
      tokenProgramId,
      associatedProgramId,
    });
  }

  /**
   * Create a new Token Sale
   *
   * @param connection The connection to use
   * @param payer Pays for the transaction
   * @param mintUSDTPubkey USDT mint
   * @param mintSOLRPubkey SOLR mint
   * @param tokenWhitelistMap Publickey of the account storing token whitelist map
   * @param tokenSaleProgramId The program ID of the token-sale program
   * @param tokenWhitelistProgramId The program ID of the token-sale program
   * @param tokenProgramId The program ID of the token program
   * @param associatedProgramId The program ID of the associated token account program
   * @return Token object for the newly minted token, Public key of the account holding the total supply of new tokens
   */
  static async createTokenSale(
    connection: Connection,
    payer: Account,
    mintUSDTPubkey: PublicKey,
    mintSOLRPubkey: PublicKey,
    tokenWhitelistMap: PublicKey,
    tokenSaleProgramId: PublicKey,
    tokenWhitelistProgramId: PublicKey,
    tokenProgramId: PublicKey,
    associatedProgramId: PublicKey,
  ): Promise<TokenSale> {
    let transaction;
    const tokenSale = new TokenSale(
      connection,
      payer,
      mintUSDTPubkey,
      mintSOLRPubkey,
      new Account(),
      tokenWhitelistMap,
      tokenSaleProgramId,
      tokenWhitelistProgramId,
      tokenProgramId,
      associatedProgramId,
    );

    return tokenSale;
  }

  /**
   * Initiaze Sale
   *
   * @param poolTransferAuthority Account delegated to transfer pool's tokens
   * @param poolDestination Pool's destination token account
   * @param saleTokenAccount Sale's token account
   * @param amount Number of tokens for sale
   * @param minAmount Minimum allocation amount
   * @param maxAmount Maximum allocation amount
   * @param price Token sale price
   * @param timestamp Token sale time to go-live
   */
  async initTokenSale(
    poolTransferAuthority: Account,
    poolDestination: PublicKey,
    saleTokenAccount: PublicKey,
    amount: number | Numberu64,
    minAmount: number | Numberu64,
    maxAmount: number | Numberu64,
    price: number | Numberu64,
    timestamp: number | Numberu64,
  ): Promise<TransactionSignature> {

    const publicKey = (property = "publicKey") => {
      return BufferLayout.blob(32, property);
    };
    const tokenSaleAccountDataLayout = BufferLayout.struct([
      BufferLayout.u8("isInitialized"),
      publicKey("initPubkey"),
      publicKey("saleTokenAccountPubkey"),
      publicKey("poolTokenAccountPubkey"),
      publicKey("whitelistAccountPubkey"),
      publicKey("whitelistProgramPubkey"),
      Layout.uint64("tokenSaleAmount"),
      Layout.uint64("minAmount"),
      Layout.uint64("maxAmount"),
      Layout.uint64("tokenSalePrice"),
      Layout.uint64("tokenSaleTime"),
    ]);
    const createSaleAccountInstruction = SystemProgram.createAccount({
        space: tokenSaleAccountDataLayout.span,
        lamports: await this.connection.getMinimumBalanceForRentExemption(tokenSaleAccountDataLayout.span, 'singleGossip'),
        fromPubkey: poolTransferAuthority.publicKey,
        newAccountPubkey: this.tokenSaleAccount.publicKey,
        programId: this.tokenSaleProgramId,
    });

    console.log('>>>>> Token Sale Account (state): ', this.tokenSaleAccount.publicKey.toString());

    return await sendAndConfirmTransaction(
      'createTokenSaleAccount and initTokenSale',
      this.connection,
      new Transaction().add(
        createSaleAccountInstruction,
        TokenSale.initTokenSaleInstruction(
          this.tokenSaleProgramId,
          amount,
          minAmount,
          maxAmount,
          price,
          timestamp,
          poolTransferAuthority.publicKey,
          this.tokenSaleAccount.publicKey,
          poolDestination,
          saleTokenAccount,
          this.tokenProgramId,
          this.tokenWhitelistProgramId,
          this.tokenWhitelistMap,
        ),
      ),
      this.payer,
      poolTransferAuthority,
      this.tokenSaleAccount,
    );
  }

  static initTokenSaleInstruction(
    tokenSaleProgramId: PublicKey,
    amount: number | Numberu64,
    minAmount: number | Numberu64,
    maxAmount: number | Numberu64,
    price: number | Numberu64,
    timestamp: number | Numberu64,
    poolTransferAuthority: PublicKey,
    tokenSaleAccount: PublicKey,
    poolDestination: PublicKey,
    saleTokenAccount: PublicKey,
    tokenProgramId: PublicKey,
    tokenWhitelistProgramId: PublicKey,
    tokenWhitelistMap: PublicKey,
  ): TransactionInstruction {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8('instruction'),
      Layout.uint64('token_sale_amount'),
      Layout.uint64('usd_min_amount'),
      Layout.uint64('usd_max_amount'),
      Layout.uint64('token_sale_price'),
      Layout.uint64('token_sale_time'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 0, // Init Sale instruction
        token_sale_amount: new Numberu64(amount).toBuffer(),
        usd_min_amount: new Numberu64(minAmount).toBuffer(),
        usd_max_amount: new Numberu64(maxAmount).toBuffer(),
        token_sale_price: new Numberu64(price*100).toBuffer(), // price is multipled by 100 for easy arithmetic inside token sale program
        token_sale_time: new Numberu64(timestamp).toBuffer(),
      },
      data,
    );

    const keys = [
      {pubkey: poolTransferAuthority, isSigner: true, isWritable: false},
      {pubkey: tokenSaleAccount, isSigner: false, isWritable: true},
      {pubkey: poolDestination, isSigner: false, isWritable: false},
      {pubkey: saleTokenAccount, isSigner: false, isWritable: true},
      {pubkey: tokenWhitelistMap, isSigner: false, isWritable: false},
      {pubkey: tokenProgramId, isSigner: false, isWritable: false},
      {pubkey: tokenWhitelistProgramId, isSigner: false, isWritable: false},
      {pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false},
    ];
    return new TransactionInstruction({
      keys,
      programId: tokenSaleProgramId,
      data,
    });
  }

  /**
   * Fund Sale
   *
   * @param poolTransferAuthority Account delegated to transfer pool's tokens
   * @param poolAccount Pool's token account
   * @param saleTokenAccount Sale's token account
   * @param amount Number of tokens for sale, to be funded into token sale account
   */
  async fundTokenSale(
    poolTransferAuthority: Account,
    poolAccount: PublicKey,
    saleTokenAccount: PublicKey,
    amount: number | Numberu64,
  ): Promise<TransactionSignature> {
    return await sendAndConfirmTransaction(
      'fundTokenSale',
      this.connection,
      new Transaction().add(
        TokenSale.fundTokenSaleInstruction(
          this.tokenSaleProgramId,
          amount,
          poolTransferAuthority.publicKey,
          this.tokenSaleAccount.publicKey,
          poolAccount,
          saleTokenAccount,
          this.tokenProgramId,
        ),
      ),
      this.payer,
      poolTransferAuthority,
    );
  }

  static fundTokenSaleInstruction(
    tokenSaleProgramId: PublicKey,
    amount: number | Numberu64,
    poolTransferAuthority: PublicKey,
    tokenSaleAccount: PublicKey,
    poolAccount: PublicKey,
    saleTokenAccount: PublicKey,
    tokenProgramId: PublicKey,
  ): TransactionInstruction {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8('instruction'),
      Layout.uint64('token_sale_amount'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 1, // Fund Sale instruction
        token_sale_amount: new Numberu64(amount).toBuffer(),
      },
      data,
    );

    const keys = [
      {pubkey: poolTransferAuthority, isSigner: true, isWritable: false},
      {pubkey: tokenSaleAccount, isSigner: false, isWritable: false},
      {pubkey: poolAccount, isSigner: false, isWritable: true},
      {pubkey: saleTokenAccount, isSigner: false, isWritable: true},
      {pubkey: tokenProgramId, isSigner: false, isWritable: false},
    ];
    return new TransactionInstruction({
      keys,
      programId: tokenSaleProgramId,
      data,
    });
  }

  /**
   * Sale token A for token B
   *
   * @param userAccount Account delegated to transfer user tokens
   * @param userSource User's source token account
   * @param userDestination User's destination token account
   * @param saleTokenAccount Pool's source token account
   * @param poolDestination Pool's destination token account
   * @param tokenWhitelistAccount Account holding token whitelist info
   * @param amount Number of tokens to transfer from source account
   */
  async executeTokenSale(
    userAccount: Account,
    userSource: PublicKey,
    userDestination: PublicKey,
    saleTokenAccount: PublicKey,
    poolDestination: PublicKey,
    tokenWhitelistAccount: PublicKey,
    amount: number | Numberu64,
  ): Promise<TransactionSignature> {

    const saleProgramDerivedAddress = await PublicKey.findProgramAddress([Buffer.from("solrsale")], TOKEN_SALE_PROGRAM_ID);
    console.log('>>>>> saleProgramDerivedAddress: ', saleProgramDerivedAddress[0].toString());

    return await sendAndConfirmTransaction(
      'executeTokenSale',
      this.connection,
      new Transaction().add(
        TokenSale.executeTokenSaleInstruction(
          this.tokenSaleProgramId,
          amount,
          userAccount.publicKey,
          this.tokenSaleAccount.publicKey,
          userSource,
          userDestination,
          saleTokenAccount,
          poolDestination,
          this.tokenProgramId,
          saleProgramDerivedAddress[0],
          this.tokenWhitelistProgramId,
          this.tokenWhitelistMap,
          tokenWhitelistAccount,
        ),
      ),
      userAccount,
    );
  }

  static executeTokenSaleInstruction(
    tokenSaleProgramId: PublicKey,
    amount: number | Numberu64,
    userAccount: PublicKey,
    tokenSaleAccount: PublicKey,
    userSource: PublicKey,
    userDestination: PublicKey,
    saleTokenAccount: PublicKey,
    poolDestination: PublicKey,
    tokenProgramId: PublicKey,
    salePDA: PublicKey,
    tokenWhitelistProgramId: PublicKey,
    tokenWhitelistMap: PublicKey,
    tokenWhitelistAccount: PublicKey,
  ): TransactionInstruction {
    const dataLayout = BufferLayout.struct([
      BufferLayout.u8('instruction'),
      Layout.uint64('usd_amount'),
    ]);

    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 2, // Execute Sale instruction
        usd_amount: new Numberu64(amount).toBuffer(),
      },
      data,
    );

    const keys = [
      {pubkey: userAccount, isSigner: true, isWritable: false},
      {pubkey: tokenSaleAccount, isSigner: false, isWritable: false},
      {pubkey: saleTokenAccount, isSigner: false, isWritable: true},
      {pubkey: userDestination, isSigner: false, isWritable: true},
      {pubkey: userSource, isSigner: false, isWritable: true},
      {pubkey: poolDestination, isSigner: false, isWritable: true},
      {pubkey: salePDA, isSigner: false, isWritable: false},
      {pubkey: tokenProgramId, isSigner: false, isWritable: false},
      {pubkey: tokenWhitelistMap, isSigner: false, isWritable: true},
      {pubkey: tokenWhitelistAccount, isSigner: false, isWritable: true},
      {pubkey: tokenWhitelistProgramId, isSigner: false, isWritable: false},
    ];
    return new TransactionInstruction({
      keys,
      programId: tokenSaleProgramId,
      data,
    });
  }
}
