/**
 * PIN Code Management and Validation Utilities
 * 
 * This module provides comprehensive PIN code functionality for merchants including:
 * - PIN code validation and security
 * - Merchant status management
 * - Audit logging
 * - Middleware for sensitive operations
 * 
 * @author Rozo Backend Team
 * @version 1.0.0
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface PinValidationResult {
  success: boolean;
  attempts_remaining: number;
  is_blocked: boolean;
  message: string;
}

export interface PinValidationMiddlewareOptions {
  supabase: any;
  merchantId: string;
  pinCode: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface PinManagementResult {
  success: boolean;
  message: string;
  error?: string;
}

export interface MerchantPinData {
  merchant_id: string;
  pin_code_hash: string | null;
  pin_code_attempts: number;
  status: string;
  pin_code_blocked_at: string | null;
}

export interface MerchantStatus {
  status: string;
  is_blocked: boolean;
  has_pin: boolean;
  pin_attempts: number;
  pin_blocked_at: string | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PIN_LENGTH = 6;
const MAX_ATTEMPTS = 3;
const BCRYPT_SALT_ROUNDS = 12;

// ============================================================================
// CORE PIN UTILITY FUNCTIONS
// ============================================================================

/**
 * Hash a PIN code using bcryptjs
 */
export async function hashPinCode(pinCode: string): Promise<string> {
  const salt = bcrypt.genSaltSync(BCRYPT_SALT_ROUNDS);
  return bcrypt.hashSync(pinCode, salt);
}

/**
 * Verify a PIN code against its hash
 */
export async function verifyPinCode(pinCode: string, hashedPin: string): Promise<boolean> {
  return bcrypt.compareSync(pinCode, hashedPin);
}

/**
 * Validate PIN code input format
 */
export function validatePinCodeInput(pinCode: string): { valid: boolean; error?: string } {
  if (!pinCode || typeof pinCode !== 'string') {
    return { valid: false, error: 'PIN code is required' };
  }
  
  if (!/^\d{6}$/.test(pinCode)) {
    return { valid: false, error: `PIN code must be exactly ${PIN_LENGTH} digits` };
  }
  
  return { valid: true };
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Get merchant PIN data from database
 */
async function getMerchantPinData(supabase: any, merchantId: string): Promise<MerchantPinData> {
  const { data, error } = await supabase
    .from('merchants')
    .select('merchant_id, pin_code_hash, pin_code_attempts, status, pin_code_blocked_at')
    .eq('merchant_id', merchantId)
    .single();
    
  if (error) throw error;
  return data;
}

/**
 * Reset PIN attempt counter
 */
async function resetPinAttempts(supabase: any, merchantId: string): Promise<void> {
  await supabase
    .from('merchants')
    .update({
      pin_code_attempts: 0,
      pin_code_last_attempt_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('merchant_id', merchantId);
}

/**
 * Increment PIN attempt counter
 */
async function incrementPinAttempts(supabase: any, merchantId: string, attempts: number): Promise<void> {
  await supabase
    .from('merchants')
    .update({
      pin_code_attempts: attempts,
      pin_code_last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('merchant_id', merchantId);
}

/**
 * Block merchant due to PIN violations
 */
async function blockMerchant(supabase: any, merchantId: string): Promise<void> {
  await supabase
    .from('merchants')
    .update({
      status: 'PIN_BLOCKED',
      pin_code_blocked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('merchant_id', merchantId);
}

// ============================================================================
// MAIN PIN VALIDATION AND MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Validate PIN code with attempt tracking and blocking logic
 */
export async function validatePinCode(
  supabase: any, 
  merchantId: string, 
  pinCode: string, 
  ipAddress?: string, 
  userAgent?: string
): Promise<PinValidationResult> {
  try {
    const merchant = await getMerchantPinData(supabase, merchantId);
    
    if (!merchant.pin_code_hash) {
      return { 
        success: true, 
        attempts_remaining: 0, 
        is_blocked: false, 
        message: "No PIN set" 
      };
    }
    
    // Check if merchant is already blocked
    if (merchant.status === 'PIN_BLOCKED') {
      return { 
        success: false, 
        attempts_remaining: 0, 
        is_blocked: true, 
        message: "Account blocked due to PIN violations" 
      };
    }
    
    // Verify PIN
    const isValid = await verifyPinCode(pinCode, merchant.pin_code_hash);
    
    if (isValid) {
      // Reset attempts on success
      await resetPinAttempts(supabase, merchantId);
      
      return { 
        success: true, 
        attempts_remaining: MAX_ATTEMPTS, 
        is_blocked: false, 
        message: "PIN validated" 
      };
    } else {
      // Increment attempts
      const newAttempts = merchant.pin_code_attempts + 1;
      await incrementPinAttempts(supabase, merchantId, newAttempts);
      
      if (newAttempts >= MAX_ATTEMPTS) {
        // Block merchant
        await blockMerchant(supabase, merchantId);
        
        return { 
          success: false, 
          attempts_remaining: 0, 
          is_blocked: true, 
          message: "Account blocked due to multiple failed PIN attempts" 
        };
      }
      
      return { 
        success: false, 
        attempts_remaining: MAX_ATTEMPTS - newAttempts, 
        is_blocked: false, 
        message: `${MAX_ATTEMPTS - newAttempts} attempts remaining` 
      };
    }
  } catch (error) {
    console.error('PIN validation error:', error);
    return { 
      success: false, 
      attempts_remaining: 0, 
      is_blocked: false, 
      message: "PIN validation failed" 
    };
  }
}

/**
 * Check merchant status and PIN information
 */
export async function checkMerchantStatus(supabase: any, merchantId: string): Promise<MerchantStatus> {
  try {
    const { data: merchant, error } = await supabase
      .from('merchants')
      .select('status, pin_code_hash, pin_code_attempts, pin_code_blocked_at')
      .eq('merchant_id', merchantId)
      .single();
      
    if (error) throw error;
    
    return {
      status: merchant.status || 'ACTIVE',
      is_blocked: merchant.status === 'PIN_BLOCKED',
      has_pin: !!merchant.pin_code_hash,
      pin_attempts: merchant.pin_code_attempts || 0,
      pin_blocked_at: merchant.pin_code_blocked_at
    };
  } catch (error) {
    console.error('Error checking merchant status:', error);
    return { 
      status: 'ACTIVE', 
      is_blocked: false, 
      has_pin: false, 
      pin_attempts: 0, 
      pin_blocked_at: null 
    };
  }
}

/**
 * Set PIN code for merchant
 */
export async function setMerchantPin(
  supabase: any, 
  merchantId: string, 
  pinCode: string, 
  ipAddress?: string, 
  userAgent?: string
): Promise<PinManagementResult> {
  try {
    // Validate PIN code input
    const validation = validatePinCodeInput(pinCode);
    if (!validation.valid) {
      return { success: false, message: validation.error! };
    }
    
    // Check if PIN is already set
    const merchant = await getMerchantPinData(supabase, merchantId);
    if (merchant.pin_code_hash) {
      return { 
        success: false, 
        message: 'PIN code is already set. Use update endpoint to change it.' 
      };
    }
    
    // Hash and store PIN code
    const hashedPin = await hashPinCode(pinCode);
    
    const { error: updateError } = await supabase
      .from('merchants')
      .update({
        pin_code_hash: hashedPin,
        pin_code_attempts: 0,
        pin_code_blocked_at: null,
        pin_code_last_attempt_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('merchant_id', merchantId);
      
    if (updateError) {
      return { success: false, message: updateError.message };
    }
    
    return { success: true, message: 'PIN code set successfully' };
  } catch (error) {
    console.error('Set PIN error:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Update PIN code for merchant
 */
export async function updateMerchantPin(
  supabase: any, 
  merchantId: string, 
  currentPin: string, 
  newPin: string, 
  ipAddress?: string, 
  userAgent?: string
): Promise<PinManagementResult> {
  try {
    // Validate both PIN codes
    const currentValidation = validatePinCodeInput(currentPin);
    if (!currentValidation.valid) {
      return { success: false, message: `Current PIN: ${currentValidation.error}` };
    }
    
    const newValidation = validatePinCodeInput(newPin);
    if (!newValidation.valid) {
      return { success: false, message: `New PIN: ${newValidation.error}` };
    }
    
    // Get merchant data
    const merchant = await getMerchantPinData(supabase, merchantId);
    
    // Check if PIN is set
    if (!merchant.pin_code_hash) {
      return { 
        success: false, 
        message: 'No PIN code is set. Use set endpoint to create one.' 
      };
    }
    
    // Verify current PIN
    const isCurrentPinValid = await verifyPinCode(currentPin, merchant.pin_code_hash);
    if (!isCurrentPinValid) {
      return { success: false, message: 'Current PIN code is incorrect' };
    }
    
    // Hash new PIN and update
    const hashedNewPin = await hashPinCode(newPin);
    
    const { error: updateError } = await supabase
      .from('merchants')
      .update({
        pin_code_hash: hashedNewPin,
        pin_code_attempts: 0,
        pin_code_blocked_at: null,
        pin_code_last_attempt_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('merchant_id', merchantId);
      
    if (updateError) {
      return { success: false, message: updateError.message };
    }
    
    return { success: true, message: 'PIN code updated successfully' };
  } catch (error) {
    console.error('Update PIN error:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Revoke PIN code for merchant
 */
export async function revokeMerchantPin(
  supabase: any, 
  merchantId: string, 
  pinCode: string, 
  ipAddress?: string, 
  userAgent?: string
): Promise<PinManagementResult> {
  try {
    // Validate PIN code input
    const validation = validatePinCodeInput(pinCode);
    if (!validation.valid) {
      return { success: false, message: validation.error! };
    }
    
    // Get merchant data
    const merchant = await getMerchantPinData(supabase, merchantId);
    
    // Check if PIN is set
    if (!merchant.pin_code_hash) {
      return { success: false, message: 'No PIN code is set' };
    }
    
    // Verify PIN before revoking
    const isPinValid = await verifyPinCode(pinCode, merchant.pin_code_hash);
    if (!isPinValid) {
      return { success: false, message: 'PIN code is incorrect' };
    }
    
    // Remove PIN code
    const { error: updateError } = await supabase
      .from('merchants')
      .update({
        pin_code_hash: null,
        pin_code_attempts: 0,
        pin_code_blocked_at: null,
        pin_code_last_attempt_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('merchant_id', merchantId);
      
    if (updateError) {
      return { success: false, message: updateError.message };
    }
    
    return { success: true, message: 'PIN code revoked successfully' };
  } catch (error) {
    console.error('Revoke PIN error:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// ============================================================================
// MIDDLEWARE FUNCTIONS
// ============================================================================

/**
 * Middleware for operations requiring PIN validation
 */
export async function requirePinValidation(options: PinValidationMiddlewareOptions): Promise<{ 
  success: boolean; 
  error?: string; 
  result?: PinValidationResult 
}> {
  const { supabase, merchantId, pinCode, ipAddress, userAgent } = options;
  
  // Validate PIN code input
  const validation = validatePinCodeInput(pinCode);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  
  // Check if merchant has PIN set
  const merchant = await getMerchantPinData(supabase, merchantId);
  if (!merchant.pin_code_hash) {
    return { success: true }; // No PIN required
  }
  
  // Validate PIN code
  const result = await validatePinCode(supabase, merchantId, pinCode, ipAddress, userAgent);
  
  if (result.success) {
    return { success: true, result };
  } else {
    return { success: false, error: result.message, result };
  }
}

/**
 * Check if merchant is blocked and return appropriate response
 */
export function createBlockedResponse(): Response {
  return Response.json(
    { 
      success: false,
      error: 'Account blocked due to PIN security violations',
      code: 'PIN_BLOCKED'
    },
    { status: 403 }
  );
}

/**
 * Extract PIN code from request headers
 */
export function extractPinFromHeaders(request: Request): string | null {
  return request.headers.get('x-pin-code');
}

/**
 * Extract client information from request
 */
export function extractClientInfo(request: Request): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
    userAgent: request.headers.get('user-agent') || undefined
  };
}
