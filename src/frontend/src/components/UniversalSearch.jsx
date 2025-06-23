import React, { useState, useEffect, useRef } from 'react';
import { Search, User, FileText, Building, Mail, Clock, ArrowRight } from 'lucide-react';

const UniversalSearch = ({ 
  placeholder = "Search customers, requests, or anything...", 
  onSelect,
  className = ""
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState({ customers: [], requests: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  
  const searchRef = useRef();
  const debounceRef = useRef();

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  // Perform universal search API call
  const performSearch = async (query) => {
    if (!query || query.trim().length < 2) {
      setResults({ customers: [], requests: [] });
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const [customersResponse, requestsResponse] = await Promise.all([
        // Search customers
        fetch(`/api/customers/search?q=${encodeURIComponent(query.trim())}&limit=5`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        }),
        // Search requests (if endpoint exists)
        fetch(`/api/service-requests?search=${encodeURIComponent(query.trim())}&limit=5`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        }).catch(() => ({ ok: false })) // Fallback if endpoint doesn't exist
      ]);

      const newResults = { customers: [], requests: [] };

      if (customersResponse.ok) {
        const customersData = await customersResponse.json();
        newResults.customers = customersData.data || [];
      }

      if (requestsResponse.ok) {
        const requestsData = await requestsResponse.json();
        newResults.requests = requestsData.data || [];
      }

      setResults(newResults);
      setIsOpen(true);
      setHighlightedIndex(-1);

    } catch (error) {
      console.error('Universal search error:', error);
      setResults({ customers: [], requests: [] });
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  // Handle input change
  const handleInputChange = (e) => {
    setSearchQuery(e.target.value);
  };

  // Get all flattened results for keyboard navigation
  const getAllResults = () => {
    const allResults = [];
    
    if (results.customers.length > 0) {
      allResults.push({ type: 'section', title: 'Customers' });
      results.customers.forEach(customer => allResults.push({ type: 'customer', data: customer }));
    }
    
    if (results.requests.length > 0) {
      allResults.push({ type: 'section', title: 'Requests' });
      results.requests.forEach(request => allResults.push({ type: 'request', data: request }));
    }
    
    return allResults;
  };

  // Handle item selection
  const handleItemSelect = (item) => {
    if (item.type === 'section') return;
    
    setSearchQuery('');
    setIsOpen(false);
    setHighlightedIndex(-1);
    onSelect?.(item);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    const allResults = getAllResults();
    const selectableResults = allResults.filter(item => item.type !== 'section');
    
    if (!isOpen || selectableResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const nextIndex = prev + 1;
          const nextItem = allResults[nextIndex];
          // Skip section headers
          if (nextItem && nextItem.type === 'section') {
            return nextIndex + 1 < allResults.length ? nextIndex + 1 : prev;
          }
          return nextIndex < allResults.length ? nextIndex : prev;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const prevIndex = prev - 1;
          const prevItem = allResults[prevIndex];
          // Skip section headers
          if (prevItem && prevItem.type === 'section') {
            return prevIndex - 1 >= 0 ? prevIndex - 1 : -1;
          }
          return prevIndex >= 0 ? prevIndex : -1;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && allResults[highlightedIndex]) {
          handleItemSelect(allResults[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allResults = getAllResults();
  const hasResults = results.customers.length > 0 || results.requests.length > 0;

  return (
    <div className={`relative ${className}`} ref={searchRef}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-purple-300 w-4 h-4" />
        <input
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (hasResults) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-colors text-white placeholder-purple-200"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-300"></div>
          </div>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && hasResults && (
        <div className="absolute z-50 w-full mt-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg shadow-xl max-h-96 overflow-y-auto">
          <div className="py-2">
            {/* Customers Section */}
            {results.customers.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs font-semibold text-purple-200 uppercase tracking-wide bg-white/5 border-b border-white/10">
                  Customers
                </div>
                {results.customers.map((customer, index) => {
                  const globalIndex = allResults.findIndex(item => 
                    item.type === 'customer' && item.data.customer_id === customer.customer_id
                  );
                  return (
                    <div
                      key={`customer-${customer.customer_id}`}
                      onClick={() => handleItemSelect({ type: 'customer', data: customer })}
                      className={`px-4 py-3 cursor-pointer transition-colors ${
                        globalIndex === highlightedIndex ? 'bg-purple-500/20' : 'hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg backdrop-blur-sm">
                          <User className="w-4 h-4 text-blue-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-white truncate">
                              {customer.name}
                            </h4>
                            <ArrowRight className="w-3 h-3 text-purple-300" />
                          </div>
                          <div className="mt-1 space-y-1">
                            {customer.company && (
                              <div className="flex items-center text-xs text-purple-200">
                                <Building className="w-3 h-3 mr-1 flex-shrink-0" />
                                <span className="truncate">{customer.company}</span>
                              </div>
                            )}
                            {customer.email && (
                              <div className="flex items-center text-xs text-purple-200">
                                <Mail className="w-3 h-3 mr-1 flex-shrink-0" />
                                <span className="truncate">{customer.email}</span>
                              </div>
                            )}
                            {customer.similarity_score && (
                              <div className="text-xs text-green-300 font-medium">
                                {Math.round(customer.similarity_score * 100)}% match
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Requests Section */}
            {results.requests.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs font-semibold text-purple-200 uppercase tracking-wide bg-white/5 border-b border-white/10">
                  Service Requests
                </div>
                {results.requests.map((request, index) => {
                  const globalIndex = allResults.findIndex(item => 
                    item.type === 'request' && item.data.id === request.id
                  );
                  return (
                    <div
                      key={`request-${request.id}`}
                      onClick={() => handleItemSelect({ type: 'request', data: request })}
                      className={`px-4 py-3 cursor-pointer transition-colors ${
                        globalIndex === highlightedIndex ? 'bg-purple-500/20' : 'hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg backdrop-blur-sm">
                          <FileText className="w-4 h-4 text-purple-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-white truncate">
                              {request.title || request.service_type}
                            </h4>
                            <ArrowRight className="w-3 h-3 text-purple-300" />
                          </div>
                          <div className="mt-1 space-y-1">
                            <div className="flex items-center justify-between text-xs text-purple-200">
                              <span>#{request.id}</span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                request.status === 'completed' ? 'bg-green-100 text-green-800' :
                                request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                request.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {request.status}
                              </span>
                            </div>
                            {request.created_at && (
                              <div className="flex items-center text-xs text-purple-200">
                                <Clock className="w-3 h-3 mr-1" />
                                {formatDate(request.created_at)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* No Results Message */}
      {isOpen && !hasResults && searchQuery.length >= 2 && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="px-4 py-6 text-center text-gray-500">
            <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No results found for "{searchQuery}"</p>
            <p className="text-xs mt-1">Try searching with different keywords</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default UniversalSearch; 