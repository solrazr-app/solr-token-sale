use solana_program::program_error::ProgramError;
use std::convert::TryInto;

use crate::error::TokenSaleError::InvalidInstruction;

pub enum TokenSaleInstruction {

    /// Accounts expected: InitTokenSale
    ///
    /// 0. `[signer]` The account initialising the sale
    /// 1. `[writable]` Account holding token sale init info
    /// 2. `[writable]` Pool token account for receiving funds from sale
    /// 3. `[writable]` Sale token account for holding the tokens for sale
    /// 4. `[]` Account holding token whitelist info
    /// 5. `[]` The token program
    /// 6. `[]` The token whitelist program
    /// 7. `[]` SYSVAR_RENT_PUBKEY
    InitTokenSale {
        token_sale_amount: u64, // amount of tokens for sale, to be deposited into sale
        usd_min_amount: u64, // minimum purchase amount in usd
        usd_max_amount: u64, // maximum purchase amount in usd
        token_sale_price: u64, // token sale price (multiplied by 100 for easy arithmetic)
        token_sale_time: u64, // time when token sale goes live
    },

    /// Accounts expected: FundTokenSale
    ///
    /// 0. `[signer]` The account funding the sale
    /// 1. `[]` Account holding token sale init info
    /// 2. `[writable]` Pool token account containing tokens for sale
    /// 3. `[writable]` Sale token account for holding the tokens for sale
    /// 4. `[]` The token program
    FundTokenSale {
        token_sale_amount: u64, // amount of tokens deposited into token sale account
    },

    /// Accounts expected: ExecuteTokenSale
    ///
    /// 0. `[signer]` The account buying from the sale
    /// 1. `[]` Account holding sale init info
    /// 2. `[writable]` Sale token account containing tokens for sale
    /// 3. `[writable]` User token account for receiving tokens purchased
    /// 4. `[writable]` User token account for sending funds
    /// 5. `[writable]` Pool token account for receiving user funds
    /// 6. `[]` The Sale program derived address
    /// 7. `[]` The token program
    /// 8. `[writable]` Account holding token whitelist info
    /// 9. `[]` The token whitelist program
    ExecuteTokenSale {
        usd_amount: u64, // purchase amount in usd
    },
}

impl TokenSaleInstruction {
    /// Unpacks a byte buffer into a [TokenSaleInstruction](enum.TokenSaleInstruction.html).
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (&tag, rest) = input.split_first().ok_or(InvalidInstruction)?;

        Ok(match tag {
            0 => {
                let (token_sale_amount, rest) = rest.split_at(8);
                let token_sale_amount = token_sale_amount
                    .try_into()
                    .ok()
                    .map(u64::from_le_bytes)
                    .ok_or(InvalidInstruction)?;

                let (usd_min_amount, rest) = rest.split_at(8);
                let usd_min_amount = usd_min_amount
                    .try_into()
                    .ok()
                    .map(u64::from_le_bytes)
                    .ok_or(InvalidInstruction)?;

                let (usd_max_amount, rest) = rest.split_at(8);
                let usd_max_amount = usd_max_amount
                    .try_into()
                    .ok()
                    .map(u64::from_le_bytes)
                    .ok_or(InvalidInstruction)?;

                let (token_sale_price, rest) = rest.split_at(8);
                let token_sale_price = token_sale_price
                    .try_into()
                    .ok()
                    .map(u64::from_le_bytes)
                    .ok_or(InvalidInstruction)?;

                let (token_sale_time, _rest) = rest.split_at(8);
                let token_sale_time = token_sale_time
                    .try_into()
                    .ok()
                    .map(u64::from_le_bytes)
                    .ok_or(InvalidInstruction)?;
                    
                Self::InitTokenSale {
                    token_sale_amount,
                    usd_min_amount,
                    usd_max_amount,
                    token_sale_price,
                    token_sale_time,
                }
            },
            1 => {
                let (token_sale_amount, _rest) = rest.split_at(8);
                let token_sale_amount = token_sale_amount
                    .try_into()
                    .ok()
                    .map(u64::from_le_bytes)
                    .ok_or(InvalidInstruction)?;

                Self::FundTokenSale {token_sale_amount}
            },
            2 => {
                let (usd_amount, _rest) = rest.split_at(8);
                let usd_amount = usd_amount
                    .try_into()
                    .ok()
                    .map(u64::from_le_bytes)
                    .ok_or(InvalidInstruction)?;

                Self::ExecuteTokenSale {usd_amount}
            },
            _ => return Err(InvalidInstruction.into()),
        })
    }
}
