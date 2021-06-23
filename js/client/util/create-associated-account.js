import {
  PublicKey,
  Connection,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';

import Wallet from '@project-serum/sol-wallet-adapter';

import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
} from '../token-sale';

export async function createAssociatedTokenAccount(
  connection: Connection,
  wallet: Wallet,
  splTokenMintAddress: PublicKey,
) {
  const [ix, address] = await createAssociatedTokenAccountIx(
    wallet.publicKey,
    wallet.publicKey,
    splTokenMintAddress,
  );
  const tx = new Transaction();
  tx.add(ix);
  tx.feePayer = wallet.publicKey;
  const txSig = await signAndSendTransactionWithWallet(connection, tx, wallet, []);

  return [address, txSig];
}

export async function createAssociatedTokenAccountIx(
  fundingAddress: PublicKey,
  walletAddress: PublicKey,
  splTokenMintAddress: PublicKey,
) {
  const associatedTokenAddress = await findAssociatedTokenAddress(
    walletAddress,
    splTokenMintAddress,
  );
  const systemProgramId = new PublicKey('11111111111111111111111111111111');
  const keys = [
    { pubkey: fundingAddress, isSigner: true, isWritable: true},
    { pubkey: associatedTokenAddress, isSigner: false, isWritable: true},
    { pubkey: walletAddress, isSigner: false, isWritable: false},
    { pubkey: splTokenMintAddress, isSigner: false, isWritable: false},
    { pubkey: systemProgramId, isSigner: false, isWritable: false},
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false},
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false},
  ];
  const ix = new TransactionInstruction({
    keys,
    programId: ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
    data: Buffer.from([]),
  });
  return [ix, associatedTokenAddress];
}

export async function findAssociatedTokenAddress(
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey,
) {
  return (
    await PublicKey.findProgramAddress(
      [
        walletAddress.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        tokenMintAddress.toBuffer(),
      ],
      ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
    )
  )[0];
}

export async function signAndSendTransactionWithWallet(
  connection: Connection,
  transaction: Transaction,
  wallet: Wallet,
  signers,
  skipPreflight = false,
) {
  transaction.recentBlockhash = (
    await connection.getRecentBlockhash('max')
  ).blockhash;
  transaction.setSigners(
    // fee payed by the wallet owner
    wallet.publicKey,
    ...signers.map((s) => s.publicKey),
  );

  if (signers.length > 0) {
    transaction.partialSign(...signers);
  }

  transaction = await wallet.signTransaction(transaction);
  const rawTransaction = transaction.serialize();
  return await connection.sendRawTransaction(rawTransaction, {
    skipPreflight,
    preflightCommitment: 'single',
  });
}