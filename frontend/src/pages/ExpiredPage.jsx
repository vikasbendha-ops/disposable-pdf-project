import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Ban, FileText, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';

const ExpiredPage = () => {
  const location = useLocation();
  const { message, status } = location.state || {};

  const isRevoked = status === 'revoked';

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl p-8 max-w-lg text-center"
      >
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
          isRevoked ? 'bg-red-100' : 'bg-stone-100'
        }`}>
          {isRevoked ? (
            <Ban className="w-10 h-10 text-red-600" />
          ) : (
            <Clock className="w-10 h-10 text-stone-600" />
          )}
        </div>

        <h1 className="font-heading text-3xl font-bold text-stone-900 mb-4">
          {isRevoked ? 'Access Revoked' : 'Link Expired'}
        </h1>
        
        <p className="text-stone-600 text-lg mb-8 leading-relaxed">
          {message || (isRevoked 
            ? 'The owner has revoked access to this document.'
            : 'This secure link has expired and the document is no longer available.'
          )}
        </p>

        <div className="bg-stone-50 rounded-xl p-6 mb-8">
          <h3 className="font-semibold text-stone-900 mb-3">Need access to this document?</h3>
          <p className="text-stone-600 text-sm">
            Contact the document owner to request a new secure link.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/">
            <Button variant="outline" className="w-full sm:w-auto h-12">
              <FileText className="w-4 h-4 mr-2" />
              Learn About Autodestroy
            </Button>
          </Link>
          <Link to="/register">
            <Button className="bg-emerald-900 hover:bg-emerald-800 w-full sm:w-auto h-12">
              Create Your Own Links
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>

        <p className="mt-8 text-sm text-stone-500">
          Autodestroy PDF Platform - Secure Document Sharing
        </p>
      </motion.div>
    </div>
  );
};

export default ExpiredPage;
