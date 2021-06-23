use solana_program::{
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

use arrayref::{array_mut_ref, array_ref, array_refs, mut_array_refs};

pub struct TokenSale {
    pub is_initialized: bool,
    pub init_pubkey: Pubkey,
    pub sale_token_account_pubkey: Pubkey,
    pub pool_token_account_pubkey: Pubkey,
    pub whitelist_account_pubkey: Pubkey,
    pub whitelist_program_pubkey: Pubkey,
    pub token_sale_amount: u64,
    pub usd_min_amount: u64,
    pub usd_max_amount: u64,
    pub token_sale_price: u64,
    pub token_sale_time: u64,
}

impl Sealed for TokenSale {}

impl IsInitialized for TokenSale {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Pack for TokenSale {
    const LEN: usize = 201;
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, TokenSale::LEN];
        let (
            is_initialized,
            init_pubkey,
            sale_token_account_pubkey,
            pool_token_account_pubkey,
            whitelist_account_pubkey,
            whitelist_program_pubkey,
            token_sale_amount,
            usd_min_amount,
            usd_max_amount,
            token_sale_price,
            token_sale_time,
        ) = array_refs![src, 1, 32, 32, 32, 32, 32, 8, 8, 8, 8, 8];

        Ok(TokenSale {
            is_initialized: match is_initialized {
                [0] => false,
                [1] => true,
                _ => return Err(ProgramError::InvalidAccountData),
            },
            init_pubkey: Pubkey::new_from_array(*init_pubkey),
            sale_token_account_pubkey: Pubkey::new_from_array(*sale_token_account_pubkey),
            pool_token_account_pubkey: Pubkey::new_from_array(*pool_token_account_pubkey),
            whitelist_account_pubkey: Pubkey::new_from_array(*whitelist_account_pubkey),
            whitelist_program_pubkey: Pubkey::new_from_array(*whitelist_program_pubkey),
            token_sale_amount: u64::from_le_bytes(*token_sale_amount),
            usd_min_amount: u64::from_le_bytes(*usd_min_amount),
            usd_max_amount: u64::from_le_bytes(*usd_max_amount),
            token_sale_price: u64::from_le_bytes(*token_sale_price),
            token_sale_time: u64::from_le_bytes(*token_sale_time),
        })
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dst = array_mut_ref![dst, 0, TokenSale::LEN];
        let (
            is_initialized_dst,
            init_pubkey_dst,
            sale_token_account_pubkey_dst,
            pool_token_account_pubkey_dst,
            whitelist_account_pubkey_dst,
            whitelist_program_pubkey_dst,
            token_sale_amount_dst,
            usd_min_amount_dst,
            usd_max_amount_dst,
            token_sale_price_dst,
            token_sale_time_dst,
        ) = mut_array_refs![dst, 1, 32, 32, 32, 32, 32, 8, 8, 8, 8, 8];

        let TokenSale {
            is_initialized,
            init_pubkey,
            sale_token_account_pubkey,
            pool_token_account_pubkey,
            whitelist_account_pubkey,
            whitelist_program_pubkey,
            token_sale_amount,
            usd_min_amount,
            usd_max_amount,
            token_sale_price,
            token_sale_time,
        } = self;

        is_initialized_dst[0] = *is_initialized as u8;
        init_pubkey_dst.copy_from_slice(init_pubkey.as_ref());
        sale_token_account_pubkey_dst.copy_from_slice(sale_token_account_pubkey.as_ref());
        pool_token_account_pubkey_dst.copy_from_slice(pool_token_account_pubkey.as_ref());
        whitelist_account_pubkey_dst.copy_from_slice(whitelist_account_pubkey.as_ref());
        whitelist_program_pubkey_dst.copy_from_slice(whitelist_program_pubkey.as_ref());
        *token_sale_amount_dst = token_sale_amount.to_le_bytes();
        *usd_min_amount_dst = usd_min_amount.to_le_bytes();
        *usd_max_amount_dst = usd_max_amount.to_le_bytes();
        *token_sale_price_dst = token_sale_price.to_le_bytes();
        *token_sale_time_dst = token_sale_time.to_le_bytes();
    }
}