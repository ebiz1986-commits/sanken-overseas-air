import axios from 'axios';

// Since we're serving from the same host in preview, we can just use /api
const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    
    let friendlyMessage = 'An unexpected error occurred. Please try again later.';
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      // Ensure data is defined
      if (!error.response.data) {
        error.response.data = {};
      }
      
      // 1. Check if the response is HTML (which happens on nginx/dev proxy / build-crashing server errors)
      const contentType = error.response.headers?.['content-type'] || '';
      if (typeof data === 'string' && (data.includes('<!DOCTYPE html>') || contentType.includes('html'))) {
        if (status === 404) {
          friendlyMessage = 'The requested service path was not found. Please verify the URL or try again.';
        } else if (status >= 500) {
          friendlyMessage = `Internal server error (${status}). The server is temporarily unable to process your request.`;
        } else {
          friendlyMessage = `Server returned an invalid format or HTML webpage with status code ${status}.`;
        }
      } else if (data) {
        // 2. Try parsing structured error messages from json responses
        if (typeof data === 'string') {
          friendlyMessage = data;
        } else if (typeof data.detail === 'string' && data.detail) {
          friendlyMessage = data.detail;
        } else if (typeof data.error === 'string' && data.error) {
          friendlyMessage = data.error;
        } else if (typeof data.message === 'string' && data.message) {
          friendlyMessage = data.message;
        } else if (typeof data.msg === 'string' && data.msg) {
          friendlyMessage = data.msg;
        } else if (typeof data.reason === 'string' && data.reason) {
          friendlyMessage = data.reason;
        } else if (typeof data.description === 'string' && data.description) {
          friendlyMessage = data.description;
        } else if (typeof data.details === 'string' && data.details) {
          friendlyMessage = data.details;
        } else if (typeof data.err === 'string' && data.err) {
          friendlyMessage = data.err;
        } else if (Array.isArray(data.errors)) {
          // If it's a validation error array (e.g. from express validator/Zod)
          friendlyMessage = data.errors.map((err: any) => {
            const field = err.path || err.field || err.param;
            return field ? `${field}: ${err.message}` : err.message;
          }).join(', ');
        } else if (data.errors && typeof data.errors === 'object') {
          // If it's a dictionary of field errors (e.g., { email: "is required", password: "is too short" })
          friendlyMessage = Object.entries(data.errors)
            .map(([field, msg]) => `${field}: ${Array.isArray(msg) ? msg.join(', ') : msg}`)
            .join(', ');
        } else {
          // Status code specific defaults if JSON is present but lacks descriptive fields
          switch (status) {
            case 400:
              friendlyMessage = 'Bad Request: Please check the information you entered and try again.';
              break;
            case 403:
              friendlyMessage = 'Access Denied: You do not have the required permissions for this action.';
              break;
            case 404:
              friendlyMessage = 'Resource not found. The requested item does not exist.';
              break;
            case 429:
              friendlyMessage = 'Too many requests. Please wait a bit and try again.';
              break;
            case 500:
              friendlyMessage = 'Server error: The database or server encountered an error processing your request.';
              break;
            default:
              friendlyMessage = `Server error (Status ${status}). Please try again later.`;
          }
        }
      }
    } else if (error.code === 'ECONNABORTED') {
      friendlyMessage = 'Request timed out. The server took too long to respond. Please try again.';
    } else if (error.message === 'Network Error') {
      friendlyMessage = 'Network Connection Error. Unable to connect to the server. Please check your internet connection.';
    } else if (error.message) {
      friendlyMessage = error.message;
    }

    // Now, normalize error.response.data to ensure components querying detail / error get the parsed string.
    if (!error.response) {
      error.response = { status: 0, headers: {}, config: error.config, data: {} };
    }
    
    error.response.data = {
      ...error.response.data,
      detail: friendlyMessage,
      error: friendlyMessage
    };
    
    return Promise.reject(error);
  }
);

export default api;
