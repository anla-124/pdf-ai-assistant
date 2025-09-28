'use client'

import { useState, useEffect } from 'react'
import { Document } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Building, Users, Briefcase, Globe, Loader2, X } from 'lucide-react'
import { 
  LAW_FIRM_OPTIONS, 
  FUND_MANAGER_OPTIONS, 
  FUND_ADMIN_OPTIONS, 
  JURISDICTION_OPTIONS,
  type LawFirmOption,
  type FundManagerOption,
  type FundAdminOption,
  type JurisdictionOption
} from '@/lib/metadata-constants'

interface EditDocumentMetadataModalProps {
  document: Document | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (updatedDocument: Document) => void
}

interface EditableMetadata {
  law_firm: LawFirmOption | ''
  fund_manager: FundManagerOption | ''
  fund_admin: FundAdminOption | ''
  jurisdiction: JurisdictionOption | ''
}

export function EditDocumentMetadataModal({ 
  document, 
  isOpen, 
  onClose, 
  onSuccess 
}: EditDocumentMetadataModalProps) {
  const [metadata, setMetadata] = useState<EditableMetadata>({
    law_firm: '',
    fund_manager: '',
    fund_admin: '',
    jurisdiction: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Initialize metadata when document changes
  useEffect(() => {
    if (document && isOpen) {
      setMetadata({
        law_firm: document.metadata?.law_firm || '',
        fund_manager: document.metadata?.fund_manager || '',
        fund_admin: document.metadata?.fund_admin || '',
        jurisdiction: document.metadata?.jurisdiction || ''
      })
      setError('')
    }
  }, [document, isOpen])

  const initializeMetadata = (doc: Document) => {
    setMetadata({
      law_firm: doc.metadata?.law_firm || '',
      fund_manager: doc.metadata?.fund_manager || '',
      fund_admin: doc.metadata?.fund_admin || '',
      jurisdiction: doc.metadata?.jurisdiction || ''
    })
    setError('')
  }

  // Reset form when modal opens/closes or document changes
  const handleOpenChange = (open: boolean) => {
    if (open && document) {
      initializeMetadata(document)
    } else if (!open) {
      onClose()
      setError('')
      setIsLoading(false)
    }
  }

  const isMetadataComplete = () => {
    return metadata.law_firm !== '' && 
           metadata.fund_manager !== '' && 
           metadata.fund_admin !== '' && 
           metadata.jurisdiction !== ''
  }

  const handleSave = async () => {
    if (!document || !isMetadataComplete()) return

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata: {
            ...document.metadata,
            law_firm: metadata.law_firm,
            fund_manager: metadata.fund_manager,
            fund_admin: metadata.fund_admin,
            jurisdiction: metadata.jurisdiction
          }
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update document')
      }

      const updatedDocument = await response.json()
      onSuccess(updatedDocument)
      onClose()
    } catch (error) {
      console.error('Error updating document metadata:', error)
      setError(error instanceof Error ? error.message : 'Failed to update document metadata')
    } finally {
      setIsLoading(false)
    }
  }

  if (!document) return null

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={() => handleOpenChange(false)}
      />
      
      {/* Modal */}
      <Card className="relative w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Edit Document Details</CardTitle>
              <CardDescription>
                Update the metadata for &quot;{document.title}&quot;
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="law-firm" className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Law Firm
              </Label>
              <Select 
                value={metadata.law_firm} 
                onValueChange={(value: LawFirmOption) => 
                  setMetadata(prev => ({ ...prev, law_firm: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Please select" />
                </SelectTrigger>
                <SelectContent>
                  {LAW_FIRM_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fund-manager" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Fund Manager
              </Label>
              <Select 
                value={metadata.fund_manager} 
                onValueChange={(value: FundManagerOption) => 
                  setMetadata(prev => ({ ...prev, fund_manager: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Please select" />
                </SelectTrigger>
                <SelectContent>
                  {FUND_MANAGER_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fund-admin" className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Fund Admin
              </Label>
              <Select 
                value={metadata.fund_admin} 
                onValueChange={(value: FundAdminOption) => 
                  setMetadata(prev => ({ ...prev, fund_admin: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Please select" />
                </SelectTrigger>
                <SelectContent>
                  {FUND_ADMIN_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="jurisdiction" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Jurisdiction
              </Label>
              <Select 
                value={metadata.jurisdiction} 
                onValueChange={(value: JurisdictionOption) => 
                  setMetadata(prev => ({ ...prev, jurisdiction: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Please select" />
                </SelectTrigger>
                <SelectContent>
                  {JURISDICTION_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/50 p-3 rounded">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!isMetadataComplete() || isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}