# SolRazr Token Sale

This repo contains
* Token Sale program
* JavaScript bindings (using @solana/web3.js)
* Test client

## Environment Setup

1. Install the latest Rust stable from https://rustup.rs/
2. Install Solana v1.6.6 or later from https://docs.solana.com/cli/install-solana-cli-tools

## Build

Start a local Solana cluster:
```bash
$ solana-test-validator
```
Build token sale on-chain program
```bash
$ cd program
$ cargo build-bpf
```
Deploy the program to localnet using the command displayed when you run the build above. Note down the public-key of the program once deployed (this is the solrazr-token-sale program id) and do the following.

Update `TOKEN_PROGRAM_ID` inside `js/client/pubkeys.js` with the public-key generated above

## Build And Deploy Token Whitelist Program

Build and deploy token whitelist program from https://github.com/solrazr-app/solr-token-whitelist
```bash
$ cd program
$ cargo build-bpf
```
Note down the public-key of the program once deployed (this is the token whitelist program id) and do the following.

Update `TOKEN_WHITELIST_PROGRAM_ID` inside `js/client/pubkeys.js` with the public-key generated above

## Setup Token Whitelist

In order to run token sale program, you will need token whitelist to be created. You will find instructions here https://github.com/solrazr-app/solr-token-whitelist

Once token whitelist is setup, you need to update 'tokenWhitelistAccount' inside `js/client/pubkeys.js` with the public-key of the token whitelist account

## Running JS Client

You can use the JS client to test the program
```bash
$ cd js
$ npm run start
```

You can modify `js/cli/main.js` and `js/cli/token-sale-test.js` to suit your needs.