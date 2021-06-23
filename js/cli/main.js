/**
 * Exercises the token-sale program
 *
 * @flow
 */

import {
	InitTokenSale,
	FundTokenSale,
  ExecuteTokenSale,
} from './token-sale-test';

import {sleep} from '../client/util/sleep';

async function main() {
  These test cases are designed to run sequentially and in the following order
  console.log('Run test: InitTokenSale');
  await InitTokenSale();
  console.log('Run test: FundTokenSale');
  await FundTokenSale();
  console.log('>>>>> Waiting for 30s before calling ExecuteTokenSale <<<<<');
  await sleep(30000);
  console.log('Run test: ExecuteTokenSale');
  await ExecuteTokenSale();
  console.log('Success\n');
}

main()
  .catch(err => {
    console.error(err);
    process.exit(-1);
  })
  .then(() => process.exit());
