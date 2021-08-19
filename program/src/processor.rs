use num_traits::FromPrimitive;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    instruction::{AccountMeta, Instruction},
    program::{invoke, invoke_signed},
    decode_error::DecodeError,
    program_error::{PrintProgramError, ProgramError},
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    sysvar::{rent::Rent, clock::Clock, Sysvar},
};
use spl_token::state::Account as TokenAccount;
use solr_token_whitelist::state::TokenWhitelist as TokenWhitelist;
use crate::{error::TokenSaleError, instruction::TokenSaleInstruction, state::TokenSale};

pub struct Processor;
impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = TokenSaleInstruction::unpack(instruction_data)?;

        match instruction {
            TokenSaleInstruction::InitTokenSale {
                token_sale_amount,
                usd_min_amount,
                usd_max_amount,
                token_sale_price,
                token_sale_time
            } => {
                msg!("Instruction: InitTokenSale");
                Self::process_init_sale(
                    accounts,
                    token_sale_amount,
                    usd_min_amount,
                    usd_max_amount,
                    token_sale_price,
                    token_sale_time,
                    program_id
                )
            }
            TokenSaleInstruction::FundTokenSale { token_sale_amount } => {
                msg!("Instruction: FundTokenSale");
                Self::process_fund_sale(
                    accounts,
                    token_sale_amount,
                    program_id
                )
            }
            TokenSaleInstruction::ExecuteTokenSale { usd_amount } => {
                msg!("Instruction: ExecuteTokenSale");
                Self::process_execute_sale(
                    accounts,
                    usd_amount,
                    program_id
                )
            }
        }
    }

    /// Processes [InitTokenSale](enum.TokenSaleInstruction.html) instruction
    fn process_init_sale(
        accounts: &[AccountInfo],
        token_sale_amount: u64,
        usd_min_amount: u64,
        usd_max_amount: u64,
        token_sale_price: u64,
        token_sale_time: u64,
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();

        let pool_account = next_account_info(account_info_iter)?;
        if !pool_account.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let token_sale_account = next_account_info(account_info_iter)?;

        let pool_usdt_account = next_account_info(account_info_iter)?;
        let token_sale_solr_account = next_account_info(account_info_iter)?;
        let token_whitelist_map = next_account_info(account_info_iter)?;

        let token_program = next_account_info(account_info_iter)?;
        let token_whitelist_program = next_account_info(account_info_iter)?;

        let sysvar_rent_pubkey = &Rent::from_account_info(next_account_info(account_info_iter)?)?;
        if !sysvar_rent_pubkey.is_exempt(token_sale_account.lamports(), token_sale_account.data_len()) {
            msg!("SOLR_ERROR_1: token sale account must be rent exempt");
            return Err(TokenSaleError::NotRentExempt.into());
        }

        let mut token_sale_state = TokenSale::unpack_unchecked(&token_sale_account.data.borrow())?;
        if token_sale_state.is_initialized() {
            msg!("token sale already initialized");
            return Err(ProgramError::AccountAlreadyInitialized);
        }

        // Transfer token sale solr account ownership to the token sale program derived address
        let (token_sale_program_address, _nonce) = Pubkey::find_program_address(&[b"solrsale"], program_id);
        msg!("Transfer token sale solr account ownership to the token sale program derived address");
        let transfer_ownership_ix = spl_token::instruction::set_authority(
            token_program.key,
            token_sale_solr_account.key,
            Some(&token_sale_program_address),
            spl_token::instruction::AuthorityType::AccountOwner,
            pool_account.key,
            &[&pool_account.key],
        )?;
        invoke(
            &transfer_ownership_ix,
            &[
                token_sale_solr_account.clone(),
                pool_account.clone(),
                token_program.clone(),
            ],
        )?;

        token_sale_state.is_initialized = true;
        token_sale_state.init_pubkey = *pool_account.key;
        token_sale_state.sale_token_account_pubkey = *token_sale_solr_account.key;
        token_sale_state.pool_token_account_pubkey = *pool_usdt_account.key;
        token_sale_state.whitelist_map_pubkey = *token_whitelist_map.key;
        token_sale_state.whitelist_program_pubkey = *token_whitelist_program.key;
        token_sale_state.token_sale_amount = token_sale_amount;
        token_sale_state.usd_min_amount = usd_min_amount;
        token_sale_state.usd_max_amount = usd_max_amount;
        token_sale_state.token_sale_price = token_sale_price;
        token_sale_state.token_sale_time = token_sale_time;
        
        TokenSale::pack(token_sale_state, &mut token_sale_account.data.borrow_mut())?;

        Ok(())
    }

    /// This instruction is redundant. Use spl token transfer to fund the sale
    /// Processes [FundTokenSale](enum.TokenSaleInstruction.html) instruction
    fn process_fund_sale(
        accounts: &[AccountInfo],
        token_sale_amount: u64,
        _program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();

        let pool_account = next_account_info(account_info_iter)?;
        if !pool_account.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let token_sale_account = next_account_info(account_info_iter)?;

        let pool_solr_account = next_account_info(account_info_iter)?;
        let token_sale_solr_account = next_account_info(account_info_iter)?;

        let token_program = next_account_info(account_info_iter)?;
        if !spl_token::check_id(token_program.key) {
            msg!("invalid token program");
            msg!(&token_program.key.to_string());
            return Err(ProgramError::InvalidAccountData);
        }

        // check if token sale can be funded
        let token_sale_state = TokenSale::unpack(&token_sale_account.data.borrow())?;
        let token_sale_solr_account_info = TokenAccount::unpack(&token_sale_solr_account.data.borrow())?;
        if !token_sale_state.is_initialized() {
            msg!("SOLR_ERROR_3: token sale needs to be initialized before funding");
            return Err(TokenSaleError::TokenSaleNotInit.into());
        }
        if token_sale_amount != token_sale_state.token_sale_amount {
            msg!("SOLR_ERROR_6: funding amount has to match token sale amount");
            msg!(&token_sale_amount.to_string());
            msg!(&token_sale_state.token_sale_amount.to_string());
            return Err(TokenSaleError::TokenSaleAmountExceeds.into());
        }
        if token_sale_solr_account_info.amount == token_sale_state.token_sale_amount {
            msg!("SOLR_ERROR_5: token sale already funded");
            msg!(&token_sale_solr_account_info.amount.to_string());
            msg!(&token_sale_state.token_sale_amount.to_string());
            return Err(TokenSaleError::TokenSaleFunded.into());
        }

        // Fund the token sale account with SOLR
        msg!("Fund the token sale account with SOLR");
        let transfer_solr_to_sale_ix = spl_token::instruction::transfer(
            token_program.key,
            pool_solr_account.key,
            token_sale_solr_account.key,
            pool_account.key,
            &[&pool_account.key],
            token_sale_amount,
        )?;
        invoke(
            &transfer_solr_to_sale_ix,
            &[
                pool_solr_account.clone(),
                token_sale_solr_account.clone(),
                pool_account.clone(),
                token_program.clone(),
            ],
        )?;

        Ok(())
    }

    /// Processes [ExecuteTokenSale](enum.TokenSaleInstruction.html) instruction
    fn process_execute_sale(
        accounts: &[AccountInfo],
        usd_amount: u64,
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();

        let user_account = next_account_info(account_info_iter)?;
        if !user_account.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let token_sale_account = next_account_info(account_info_iter)?;

        let token_sale_solr_account = next_account_info(account_info_iter)?;
        let user_solr_account = next_account_info(account_info_iter)?;

        let user_usdt_account = next_account_info(account_info_iter)?;
        let pool_usdt_account = next_account_info(account_info_iter)?;

        let sale_pda = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;

        let token_whitelist_map = next_account_info(account_info_iter)?;
        let token_whitelist_account = next_account_info(account_info_iter)?;
        let token_whitelist_program = next_account_info(account_info_iter)?;
        
        let token_sale_state = TokenSale::unpack(&token_sale_account.data.borrow())?;
        let token_sale_solr_account_info = TokenAccount::unpack(&token_sale_solr_account.data.borrow())?;
        let mut token_whitelist_map_state = TokenWhitelist::unpack_from_slice(&token_whitelist_map.data.borrow())?;
        let mut token_whitelist_account_state = TokenWhitelist::unpack_from_slice(&token_whitelist_account.data.borrow())?;

        // check if token sale is allowed
        if !spl_token::check_id(token_program.key) {
            msg!("invalid token program");
            msg!(&token_program.key.to_string());
            return Err(ProgramError::InvalidAccountData);
        }
        if token_sale_state.whitelist_map_pubkey != *token_whitelist_map.key {
            msg!("invalid token whitelist account map");
            msg!(&token_sale_state.whitelist_map_pubkey.to_string());
            msg!(&token_whitelist_map.key.to_string());
            return Err(ProgramError::InvalidAccountData);
        }
        if token_sale_state.whitelist_program_pubkey != *token_whitelist_program.key {
            msg!("invalid token whitelist program");
            msg!(&token_sale_state.whitelist_program_pubkey.to_string());
            msg!(&token_whitelist_program.key.to_string());
            return Err(ProgramError::InvalidAccountData);
        }
        if !token_whitelist_map_state.contains_key(&token_whitelist_account.key.to_string()) {
            msg!("invalid token whitelist account");
            msg!("{}", token_whitelist_account.key);
            return Err(ProgramError::InvalidAccountData);
        }
        if !token_whitelist_account_state.contains_key(&user_account.key.to_string()) {
            msg!("SOLR_ERROR_2: user is not whitelisted");
            msg!("{}", user_account.key);
            return Err(TokenSaleError::UserNotWhitelisted.into());
        }
        let mut allocation_amount: u64 = 0;
        if let Some(value) = token_whitelist_account_state.get(&user_account.key.to_string()) {
            allocation_amount = *value;
        }
        if usd_amount > allocation_amount {
            msg!("SOLR_ERROR_11: amount exceeds your allocation");
            msg!("{}", usd_amount);
            msg!("{}", allocation_amount);
            return Err(TokenSaleError::ExceedsAllocation.into());
        }
        let clock = Clock::get()?;
        if (clock.unix_timestamp as u64) < token_sale_state.token_sale_time {
            msg!("SOLR_ERROR_4: token sale has not started");
            msg!("{}", clock.unix_timestamp);
            msg!("{}", token_sale_state.token_sale_time);
            return Err(TokenSaleError::TokenSaleNotStarted.into());
        }
        if token_sale_state.sale_token_account_pubkey != *token_sale_solr_account.key {
            msg!("token sale account does not match");
            msg!(&token_sale_state.sale_token_account_pubkey.to_string());
            msg!(&token_sale_solr_account.key.to_string());
            return Err(ProgramError::InvalidAccountData);
        }
        if token_sale_state.pool_token_account_pubkey != *pool_usdt_account.key {
            msg!("pool usdt account does not match");
            msg!(&token_sale_state.pool_token_account_pubkey.to_string());
            msg!(&pool_usdt_account.key.to_string());
            return Err(ProgramError::InvalidAccountData);
        }
        if token_sale_solr_account_info.amount <= 0 {
            msg!("SOLR_ERROR_7: token sale has ended");
            msg!(&token_sale_solr_account_info.amount.to_string());
            return Err(TokenSaleError::TokenSaleEnded.into());
        }
        if usd_amount < token_sale_state.usd_min_amount {
            msg!("SOLR_ERROR_8: amount less than minimum allocation");
            msg!(&usd_amount.to_string());
            msg!(&token_sale_state.usd_min_amount.to_string());
            return Err(TokenSaleError::AmountMinimum.into());
        }
        if usd_amount > token_sale_state.usd_max_amount {
            msg!("SOLR_ERROR_9: amount more than maximum allocation");
            msg!(&usd_amount.to_string());
            msg!(&token_sale_state.usd_max_amount.to_string());
            return Err(TokenSaleError::AmountMaximum.into());
        }
        let token_purchase_amount = usd_amount * token_sale_state.token_sale_price;
        if token_purchase_amount > token_sale_solr_account_info.amount {
            msg!("SOLR_ERROR_10: amount exceeds tokens available for sale");
            msg!(&token_purchase_amount.to_string());
            msg!(&token_sale_solr_account_info.amount.to_string());
            return Err(TokenSaleError::AmountExceeds.into());
        }

        // Transfer USDT to the pool account
        msg!("Transfer USDT to the pool account");
        let transfer_usdt_to_pool_ix = spl_token::instruction::transfer(
            token_program.key,
            user_usdt_account.key,
            pool_usdt_account.key,
            user_account.key,
            &[&user_account.key],
            usd_amount,
        )?;
        invoke(
            &transfer_usdt_to_pool_ix,
            &[
                user_usdt_account.clone(),
                pool_usdt_account.clone(),
                user_account.clone(),
                token_program.clone(),
            ],
        )?;

        // Transfer SOLR to the user
        msg!("Transfer SOLR to the user");
        let (token_sale_program_address, _nonce) = Pubkey::find_program_address(&[b"solrsale"], program_id);
        let transfer_solr_to_user_ix = spl_token::instruction::transfer(
            token_program.key,
            token_sale_solr_account.key,
            user_solr_account.key,
            &token_sale_program_address,
            &[&token_sale_program_address],
            token_purchase_amount,
        )?;
        msg!(&(&token_sale_program_address).to_string());
        invoke_signed(
            &transfer_solr_to_user_ix,
            &[
                token_sale_solr_account.clone(),
                user_solr_account.clone(),
                sale_pda.clone(),
                token_program.clone(),
            ],
            &[&[&b"solrsale"[..], &[_nonce]]],
        )?;

        // Update token whitelist data after successful purchase
        // Purchase is allowed only once and allocation will be reset to zero
        let mut accounts_to_send = Vec::with_capacity(3);
        accounts_to_send.push(AccountMeta::new_readonly(*user_account.key, true));
        accounts_to_send.push(AccountMeta::new(*token_whitelist_account.key, false));
        accounts_to_send.push(AccountMeta::new_readonly(*user_account.key, false));
        let mut data: Vec<u8> = Vec::new();
        data.push(3); // instruction to reset allocation to zero
        let update_token_whitelist_ix = Instruction {
            program_id: *token_whitelist_program.key,
            accounts: accounts_to_send,
            data,
        };
        invoke(
            &update_token_whitelist_ix,
            &[
                user_account.clone(),
                token_whitelist_account.clone(),
                token_whitelist_program.clone(),
            ],
        )?;

        Ok(())
    }
}

impl PrintProgramError for TokenSaleError {
    fn print<E>(&self)
    where
        E: 'static + std::error::Error + DecodeError<E> + PrintProgramError + FromPrimitive,
    {
        match self {
            TokenSaleError::InvalidInstruction => msg!("Error: Invalid Instruction"),
            TokenSaleError::NotRentExempt => msg!("Error: Not Rent Exempt"),
            TokenSaleError::UserNotWhitelisted => msg!("Error: User Not Whitelisted"),
            TokenSaleError::TokenSaleNotInit => msg!("Error: Token Sale Not Initialized"),
            TokenSaleError::TokenSaleNotStarted => msg!("Error: Token Sale Not Started"),
            TokenSaleError::TokenSaleFunded => msg!("Error: Token Sale Funded"),
            TokenSaleError::TokenSaleAmountExceeds => msg!("Error: Token Sale Amount Exceeds"),
            TokenSaleError::TokenSaleEnded => msg!("Error: Token Sale Ended"),
            TokenSaleError::AmountMinimum => msg!("Error: Amount Less Than Minimum"),
            TokenSaleError::AmountMaximum => msg!("Error: Amount More Than Maximum"),
            TokenSaleError::AmountExceeds => msg!("Error: Amount Exceeds Tokens Available For Sale"),
            TokenSaleError::ExceedsAllocation => msg!("Error: Amount Exceeds Your Allocation"),
        }
    }
}
