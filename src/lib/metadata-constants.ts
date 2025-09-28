// Business metadata constants for consistent options across the application

export const LAW_FIRM_OPTIONS = [
  { value: 'STB', label: 'STB' },
  { value: 'Proskauer', label: 'Proskauer' },
  { value: 'N/A', label: 'N/A' }
] as const

export const FUND_MANAGER_OPTIONS = [
  { value: 'Blackstone', label: 'Blackstone' },
  { value: 'KKR', label: 'KKR' },
  { value: 'N/A', label: 'N/A' }
] as const

export const FUND_ADMIN_OPTIONS = [
  { value: 'Standish', label: 'Standish' },
  { value: 'CITCO', label: 'CITCO' },
  { value: 'N/A', label: 'N/A' }
] as const

export const JURISDICTION_OPTIONS = [
  { value: 'Delaware', label: 'Delaware' },
  { value: 'Cayman Islands', label: 'Cayman Islands' },
  { value: 'N/A', label: 'N/A' }
] as const

// Type exports for TypeScript
export type LawFirmOption = typeof LAW_FIRM_OPTIONS[number]['value']
export type FundManagerOption = typeof FUND_MANAGER_OPTIONS[number]['value']
export type FundAdminOption = typeof FUND_ADMIN_OPTIONS[number]['value']
export type JurisdictionOption = typeof JURISDICTION_OPTIONS[number]['value']

// Default values (empty means user hasn't made a choice yet)
export const DEFAULT_METADATA = {
  law_firm: '' as LawFirmOption | '',
  fund_manager: '' as FundManagerOption | '',
  fund_admin: '' as FundAdminOption | '',
  jurisdiction: '' as JurisdictionOption | ''
}