import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Building, Phone, Mail, MapPin, Clock, AlertCircle } from 'lucide-react';

const CustomerSearch = ({ 
  value, 
  onChange, 
  onSelect, 
  placeholder = "Search customers by name, email, or company...", 
  error,
  disabled = false,
  showDetails = true 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  
  const searchRef = useRef();
  const resultsRef = useRef();
  const debounceRef = useRef();

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Perform search API call
  const performSearch = async (query) => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/customers/search?q=${encodeURIComponent(query.trim())}&limit=8`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setResults(data.data || []);
        setIsOpen(true);
        setHighlightedIndex(-1);
      } else {
        console.error('Search failed:', response.statusText);
        setResults([]);
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
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
    const query = e.target.value;
    setSearchQuery(query);
    
    // Clear selection if user is typing
    if (selectedCustomer && query !== selectedCustomer.name) {
      setSelectedCustomer(null);
      onChange?.(null);
    }
  };

  // Handle customer selection
  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setSearchQuery(customer.name);
    setIsOpen(false);
    setHighlightedIndex(-1);
    onChange?.(customer.customer_id);
    onSelect?.(customer);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          handleCustomerSelect(results[highlightedIndex]);
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

  // Calculate similarity score color
  const getSimilarityColor = (score) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-gray-600';
  };

  return (
    <div className="relative" ref={searchRef}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
            error ? 'border-red-300' : 'border-gray-300'
          } ${disabled ? 'bg-gray-50 cursor-not-allowed' : ''}`}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="mt-1 text-sm text-red-600 flex items-center">
          <AlertCircle className="w-4 h-4 mr-1" />
          {error}
        </p>
      )}

      {/* Selected Customer Details */}
      {selectedCustomer && showDetails && (
        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-semibold text-gray-900">{selectedCustomer.name}</h4>
                  {selectedCustomer.priority && (
                    <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                      selectedCustomer.priority === 'critical' ? 'bg-red-100 text-red-800' :
                      selectedCustomer.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                      selectedCustomer.priority === 'standard' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedCustomer.priority}
                    </span>
                  )}
                </div>
                <div className="mt-1 space-y-1">
                  {selectedCustomer.company && (
                    <div className="flex items-center text-xs text-gray-600">
                      <Building className="w-3 h-3 mr-1" />
                      {selectedCustomer.company}
                    </div>
                  )}
                  {selectedCustomer.email && (
                    <div className="flex items-center text-xs text-gray-600">
                      <Mail className="w-3 h-3 mr-1" />
                      {selectedCustomer.email}
                    </div>
                  )}
                  {selectedCustomer.last_activity && (
                    <div className="flex items-center text-xs text-gray-500">
                      <Clock className="w-3 h-3 mr-1" />
                      Last activity: {formatDate(selectedCustomer.last_activity)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div 
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto"
          ref={resultsRef}
        >
          <div className="py-2">
            {results.map((customer, index) => (
              <div
                key={customer.customer_id}
                onClick={() => handleCustomerSelect(customer)}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1 min-w-0">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <User className="w-4 h-4 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-semibold text-gray-900 truncate">
                          {customer.name}
                        </h4>
                        {customer.similarity_score && (
                          <span className={`text-xs font-medium ${getSimilarityColor(customer.similarity_score)}`}>
                            {Math.round(customer.similarity_score * 100)}% match
                          </span>
                        )}
                      </div>
                      <div className="mt-1 space-y-1">
                        {customer.company && (
                          <div className="flex items-center text-xs text-gray-600">
                            <Building className="w-3 h-3 mr-1 flex-shrink-0" />
                            <span className="truncate">{customer.company}</span>
                          </div>
                        )}
                        {customer.email && (
                          <div className="flex items-center text-xs text-gray-600">
                            <Mail className="w-3 h-3 mr-1 flex-shrink-0" />
                            <span className="truncate">{customer.email}</span>
                          </div>
                        )}
                        {customer.last_activity && (
                          <div className="flex items-center text-xs text-gray-500">
                            <Clock className="w-3 h-3 mr-1 flex-shrink-0" />
                            Last activity: {formatDate(customer.last_activity)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Results Message */}
      {isOpen && results.length === 0 && searchQuery.length >= 2 && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="px-4 py-6 text-center text-gray-500">
            <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No customers found for "{searchQuery}"</p>
            <p className="text-xs mt-1">Try searching with a different term</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerSearch; 