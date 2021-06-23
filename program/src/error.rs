use thiserror::Error;

use solana_program::program_error::ProgramError;

#[derive(Error, Debug, Copy, Clone)]
pub enum TokenSaleError {
    /// Invalid instruction
    #[error("Invalid Instruction")]
    InvalidInstruction,
    /// Not Rent Exempt
    #[error("Not Rent Exempt")]
    NotRentExempt,
    /// User Not Whitelisted
    #[error("User Not Whitelisted")]
    UserNotWhitelisted,
    /// Token Sale Not Initialized
    #[error("Token Sale Not Initialized")]
    TokenSaleNotInit,
    /// Token Sale Not Started
    #[error("Token Sale Not Started")]
    TokenSaleNotStarted,
    /// Token Sale Funded
    #[error("Token Sale Funded")]
    TokenSaleFunded,
    /// Token Sale Amount Exceeds
    #[error("Token Sale Amount Exceeds")]
    TokenSaleAmountExceeds,
    /// Token Sale Ended
    #[error("Token Sale Ended")]
    TokenSaleEnded,
    /// Amount Less Than Minimum
    #[error("Amount Less Than Minimum")]
    AmountMinimum,
    /// Amount More Than Maximum
    #[error("Amount More Than Maximum")]
    AmountMaximum,
    /// Amount Exceeds Tokens Available For Sale
    #[error("Amount Exceeds Tokens Available For Sale")]
    AmountExceeds,
    /// Amount Exceeds Your Allocation
    #[error("Amount Exceeds Your Allocation")]
    ExceedsAllocation,
}

impl From<TokenSaleError> for ProgramError {
    fn from(e: TokenSaleError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
