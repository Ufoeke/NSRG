import React, { useState, useEffect } from 'react';
import { FileText, Star, Clock, ChevronDown, Loader } from 'lucide-react';

const TemplateSelector = ({ 
  serviceType, 
  customerId, 
  selectedTemplate, 
  onTemplateSelect 
}) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch templates when service type or customer changes
  useEffect(() => {
    if (!serviceType) {
      setTemplates([]);
      return;
    }

    const fetchTemplates = async () => {
      setLoading(true);
      try {
        let url = `/api/templates?service_type=${serviceType}`;
        if (customerId) {
          url += `&customer_id=${customerId}`;
        }

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          setTemplates(data.data || []);
        } else {
          console.error('Failed to fetch templates');
          setTemplates([]);
        }
      } catch (error) {
        console.error('Error fetching templates:', error);
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, [serviceType, customerId]);

  const handleTemplateSelect = (template) => {
    onTemplateSelect(template);
    setIsOpen(false);
  };

  if (!serviceType) return null;

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Use Template (Optional)
      </label>
      
      {loading ? (
        <div className="flex items-center justify-center p-4 border border-gray-200 rounded-lg">
          <Loader className="w-4 h-4 animate-spin mr-2" />
          <span className="text-sm text-gray-500">Loading templates...</span>
        </div>
      ) : templates.length > 0 ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between p-3 border border-gray-300 rounded-lg hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700">
                {selectedTemplate ? selectedTemplate.template_name : 'Choose a template...'}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => handleTemplateSelect(null)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                >
                  No template
                </button>
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateSelect(template)}
                    className={`w-full text-left px-3 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                      selectedTemplate?.id === template.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="text-sm font-medium text-gray-900">
                            {template.template_name}
                          </h4>
                          {template.is_favorite && (
                            <Star className="w-3 h-3 text-yellow-500 fill-current" />
                          )}
                        </div>
                        {template.description && (
                          <p className="text-xs text-gray-600 mb-2">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center space-x-3 text-xs text-gray-500">
                          {template.created_by && (
                            <span>by {template.created_by}</span>
                          )}
                          {template.usage_count && (
                            <span>{template.usage_count} uses</span>
                          )}
                          {template.last_used && (
                            <div className="flex items-center">
                              <Clock className="w-3 h-3 mr-1" />
                              {new Date(template.last_used).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <FileText className="w-4 h-4" />
            <span>No templates available for {serviceType}</span>
          </div>
        </div>
      )}

      {selectedTemplate && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start space-x-2">
            <FileText className="w-4 h-4 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-blue-900">
                {selectedTemplate.template_name}
              </h4>
              {selectedTemplate.description && (
                <p className="text-xs text-blue-700 mt-1">
                  {selectedTemplate.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateSelector; 