'use client'

import { useState, useRef } from 'react'
import { Document, SearchFilters } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Search, Loader2, RotateCcw, X, Building, Users, Briefcase, Globe } from 'lucide-react'
import { SimilarityResults } from './similarity-results'
import { 
  LAW_FIRM_OPTIONS, 
  FUND_MANAGER_OPTIONS, 
  FUND_ADMIN_OPTIONS, 
  JURISDICTION_OPTIONS 
} from '@/lib/metadata-constants'

interface SimilaritySearchFormProps {
  documentId: string
  sourceDocument: Document
}

export function SimilaritySearchForm({ documentId, sourceDocument }: SimilaritySearchFormProps) {
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [filters, setFilters] = useState<SearchFilters>({
    min_score: 0.7,
    page_range: {
      use_entire_document: true
    }
  })
  const [topK, setTopK] = useState(20)
  const abortControllerRef = useRef<AbortController | null>(null)

  const handleSearch = async () => {
    setIsSearching(true)
    setHasSearched(true)
    
    // Create new AbortController for this search
    abortControllerRef.current = new AbortController()
    
    try {
      const response = await fetch(`/api/documents/${documentId}/similar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters,
          topK,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error('Failed to search for similar documents')
      }

      const data = await response.json()
      setResults(data)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Search cancelled by user')
        setResults([])
      } else {
        console.error('Similarity search error:', error)
        alert('Failed to search for similar documents. Please try again.')
      }
    } finally {
      setIsSearching(false)
      abortControllerRef.current = null
    }
  }

  const handleStopSearch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsSearching(false)
    }
  }

  const resetSearch = () => {
    setResults([])
    setHasSearched(false)
    setFilters({ 
      min_score: 0.7,
      page_range: {
        use_entire_document: true
      },
      law_firm: [],
      fund_manager: [],
      fund_admin: [],
      jurisdiction: []
    })
    setTopK(20)
  }

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card className="card-enhanced">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Similarity Search
              </CardTitle>
              <CardDescription>
                Find documents similar to &quot;{sourceDocument.title}&quot;
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={resetSearch}
              disabled={!hasSearched}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Page Range Selection */}
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">Search Scope</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant={filters.page_range?.use_entire_document ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilters(prev => ({
                    ...prev,
                    page_range: {
                      ...prev.page_range,
                      use_entire_document: true
                    }
                  }))}
                >
                  Search entire document
                </Button>
                <Button
                  type="button"
                  variant={!filters.page_range?.use_entire_document ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilters(prev => ({
                    ...prev,
                    page_range: {
                      ...prev.page_range,
                      use_entire_document: false
                    }
                  }))}
                >
                  Search specific page range
                </Button>
              </div>
            </div>

            {!filters.page_range?.use_entire_document && (
              <div className="grid grid-cols-2 gap-4 pl-6">
                <div>
                  <Label htmlFor="startPage">From page</Label>
                  <Input
                    id="startPage"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={filters.page_range?.start_page || ''}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      page_range: {
                        ...prev.page_range,
                        start_page: e.target.value ? parseInt(e.target.value) : undefined
                      }
                    }))}
                  />
                </div>
                <div>
                  <Label htmlFor="endPage">To page</Label>
                  <Input
                    id="endPage"
                    type="number"
                    min="1"
                    placeholder="10"
                    value={filters.page_range?.end_page || ''}
                    onChange={(e) => setFilters(prev => ({
                      ...prev,
                      page_range: {
                        ...prev.page_range,
                        end_page: e.target.value ? parseInt(e.target.value) : undefined
                      }
                    }))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Business Metadata Filters */}
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">Filters</Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="flex items-center gap-2 text-xs">
                  <Building className="h-3 w-3" />
                  Law Firm
                </Label>
                <Select 
                  value={filters.law_firm?.[0] || "any"} 
                  onValueChange={(value) => 
                    setFilters(prev => ({ 
                      ...prev, 
                      law_firm: value === "any" ? [] : [value as any] 
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Any law firm" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any law firm</SelectItem>
                    {LAW_FIRM_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="flex items-center gap-2 text-xs">
                  <Users className="h-3 w-3" />
                  Fund Manager
                </Label>
                <Select 
                  value={filters.fund_manager?.[0] || "any"} 
                  onValueChange={(value) => 
                    setFilters(prev => ({ 
                      ...prev, 
                      fund_manager: value === "any" ? [] : [value as any] 
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Any fund manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any fund manager</SelectItem>
                    {FUND_MANAGER_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="flex items-center gap-2 text-xs">
                  <Briefcase className="h-3 w-3" />
                  Fund Admin
                </Label>
                <Select 
                  value={filters.fund_admin?.[0] || "any"} 
                  onValueChange={(value) => 
                    setFilters(prev => ({ 
                      ...prev, 
                      fund_admin: value === "any" ? [] : [value as any] 
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Any fund admin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any fund admin</SelectItem>
                    {FUND_ADMIN_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="flex items-center gap-2 text-xs">
                  <Globe className="h-3 w-3" />
                  Jurisdiction
                </Label>
                <Select 
                  value={filters.jurisdiction?.[0] || "any"} 
                  onValueChange={(value) => 
                    setFilters(prev => ({ 
                      ...prev, 
                      jurisdiction: value === "any" ? [] : [value as any] 
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Any jurisdiction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any jurisdiction</SelectItem>
                    {JURISDICTION_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Search Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="topK">Number of Results</Label>
              <Select value={topK.toString()} onValueChange={(value) => setTopK(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 results</SelectItem>
                  <SelectItem value="10">10 results</SelectItem>
                  <SelectItem value="20">20 results</SelectItem>
                  <SelectItem value="50">50 results</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="minScore">Minimum Similarity: {Math.round((filters.min_score || 0.7) * 100)}%</Label>
              <div className="px-2 py-2">
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[Math.round((filters.min_score || 0.7) * 100)]}
                  onValueChange={(value) => setFilters(prev => ({ 
                    ...prev, 
                    min_score: value[0] / 100 
                  }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            <div className="flex items-end gap-2">
              {isSearching ? (
                <>
                  <Button
                    onClick={handleStopSearch}
                    variant="destructive"
                    className="flex-1"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Stop Searching
                  </Button>
                  <Button
                    disabled
                    variant="outline"
                    className="flex-1"
                  >
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Searching...
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handleSearch}
                  className="w-full"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {hasSearched && (
        <SimilarityResults 
          results={results} 
          sourceDocument={sourceDocument}
          isLoading={isSearching}
        />
      )}
    </div>
  )
}