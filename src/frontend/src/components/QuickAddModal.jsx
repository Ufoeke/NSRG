import React, { useState } from 'react';
import { X, Plus, AlertCircle, CheckCircle } from 'lucide-react';
import CustomerSearch from './CustomerSearch';
import TemplateSelector from './TemplateSelector';

const QuickAddModal = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    serviceType: '',
    title: '',
    description: '',
    priority: 'medium',
    customerId: '',
    selectedCustomer: null,
    selectedTemplate: null,
    serviceDetails: {}
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  const serviceTypes = [
    { value: 'firewall', label: 'Firewall Service', description: 'Configure firewall rules and policies' },
    { value: 'vlan', label: 'VLAN Service', description: 'Manage VLAN configurations' },
    { value: 'wireless', label: 'Wireless Service', description: 'Configure wireless network settings' }
  ];

  const priorityLevels = [
    { value: 'low', label: 'Low', color: 'text-green-600' },
    { value: 'medium', label: 'Medium', color: 'text-yellow-600' },
    { value: 'high', label: 'High', color: 'text-red-600' }
  ];

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.serviceType) {
      newErrors.serviceType = 'Service type is required';
    }

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (formData.title.trim().length < 5) {
      newErrors.title = 'Title must be at least 5 characters';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.trim().length < 10) {
      newErrors.description = 'Description must be at least 10 characters';
    }

    if (!formData.customerId.trim()) {
      newErrors.customerId = 'Customer ID is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const requestData = {
        ...formData,
        id: `REQ-${Date.now()}`,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      setSubmitStatus('success');
      setTimeout(() => {
        onSubmit(requestData);
        handleClose();
      }, 1000);

    } catch (error) {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      serviceType: '',
      title: '',
      description: '',
      priority: 'medium',
      customerId: '',
      selectedCustomer: null,
      selectedTemplate: null,
      serviceDetails: {}
    });
    setErrors({});
    setSubmitStatus(null);
    setIsSubmitting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Plus className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Quick Add Request</h2>
              <p className="text-sm text-gray-500">Create a new service request quickly</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Service Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Service Type *
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {serviceTypes.map((service) => (
                <button
                  key={service.value}
                  type="button"
                  onClick={() => handleInputChange('serviceType', service.value)}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    formData.serviceType === service.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">{service.label}</div>
                  <div className="text-sm text-gray-500 mt-1">{service.description}</div>
                </button>
              ))}
            </div>
            {errors.serviceType && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.serviceType}
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Request Title *
            </label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="Enter a descriptive title for your request"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.title ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.title}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <textarea
              id="description"
              rows={4}
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Provide detailed information about your request"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none ${
                errors.description ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.description}
              </p>
            )}
          </div>

          {/* Priority and Customer ID Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Priority */}
            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
                Priority
              </label>
              <select
                id="priority"
                value={formData.priority}
                onChange={(e) => handleInputChange('priority', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {priorityLevels.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer *
              </label>
              <CustomerSearch
                value={formData.customerId}
                onChange={(customerId) => handleInputChange('customerId', customerId)}
                onSelect={(customer) => handleInputChange('selectedCustomer', customer)}
                placeholder="Search by customer name, email, or company..."
                error={errors.customerId}
                showDetails={false}
              />
            </div>

            {/* Template Selection */}
            {formData.serviceType && (
              <div>
                <TemplateSelector
                  serviceType={formData.serviceType}
                  customerId={formData.customerId}
                  selectedTemplate={formData.selectedTemplate}
                  onTemplateSelect={(template) => {
                    handleInputChange('selectedTemplate', template);
                    // Auto-fill form data if template is selected
                    if (template && template.template_data) {
                      const templateData = template.template_data;
                      if (templateData.title) handleInputChange('title', templateData.title);
                      if (templateData.description) handleInputChange('description', templateData.description);
                      if (templateData.priority) handleInputChange('priority', templateData.priority);
                      if (templateData.serviceDetails) handleInputChange('serviceDetails', templateData.serviceDetails);
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* Submit Status */}
          {submitStatus && (
            <div className={`p-4 rounded-lg flex items-center ${
              submitStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {submitStatus === 'success' ? (
                <CheckCircle className="w-5 h-5 mr-2" />
              ) : (
                <AlertCircle className="w-5 h-5 mr-2" />
              )}
              {submitStatus === 'success' 
                ? 'Request created successfully!' 
                : 'Failed to create request. Please try again.'
              }
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Request
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickAddModal; 