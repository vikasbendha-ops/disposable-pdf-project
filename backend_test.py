#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

# Use public endpoint from environment
BASE_URL = "https://secure-expire-pdf.preview.emergentagent.com/api"

class AutodestroyPDFTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.session.verify = True
        self.token = None
        self.user_data = None
        self.tests_run = 0
        self.tests_passed = 0
        
    def log_test(self, name, success, message=""):
        """Log test result"""
        self.tests_run += 1
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if message:
            print(f"    {message}")
        if success:
            self.tests_passed += 1
        print()
    
    def test_api_root(self):
        """Test API root endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/")
            success = response.status_code == 200
            data = response.json() if success else {}
            
            if success:
                message = f"API version: {data.get('version', 'unknown')}"
            else:
                message = f"Expected 200, got {response.status_code}"
                
            self.log_test("API Root Endpoint", success, message)
            return success
        except Exception as e:
            self.log_test("API Root Endpoint", False, f"Error: {str(e)}")
            return False
    
    def test_subscription_plans(self):
        """Test subscription plans endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/subscription/plans")
            success = response.status_code == 200
            
            if success:
                plans = response.json()
                plan_names = list(plans.keys())
                message = f"Available plans: {', '.join(plan_names)}"
            else:
                message = f"Expected 200, got {response.status_code}"
                
            self.log_test("Subscription Plans", success, message)
            return success
        except Exception as e:
            self.log_test("Subscription Plans", False, f"Error: {str(e)}")
            return False
    
    def test_user_registration(self):
        """Test user registration"""
        try:
            # Generate unique test user
            timestamp = datetime.now().strftime('%H%M%S')
            test_data = {
                "name": f"Test User {timestamp}",
                "email": f"test{timestamp}@example.com",
                "password": "testpass123"
            }
            
            response = self.session.post(f"{self.base_url}/auth/register", json=test_data)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                self.token = data.get('access_token')
                self.user_data = data.get('user', {})
                self.session.headers.update({'Authorization': f'Bearer {self.token}'})
                message = f"Registered user: {self.user_data.get('name')} ({self.user_data.get('email')})"
            else:
                error_detail = response.json().get('detail', 'Unknown error') if response.content else f"HTTP {response.status_code}"
                message = f"Registration failed: {error_detail}"
                
            self.log_test("User Registration", success, message)
            return success
        except Exception as e:
            self.log_test("User Registration", False, f"Error: {str(e)}")
            return False
    
    def test_user_login(self):
        """Test user login with registered credentials"""
        if not self.user_data:
            self.log_test("User Login", False, "No user registered, skipping login test")
            return False
            
        try:
            # Use the registered user's credentials
            login_data = {
                "email": self.user_data.get('email'),
                "password": "testpass123"  # Known password from registration
            }
            
            response = self.session.post(f"{self.base_url}/auth/login", json=login_data)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                self.token = data.get('access_token')
                self.session.headers.update({'Authorization': f'Bearer {self.token}'})
                user = data.get('user', {})
                message = f"Logged in as: {user.get('name')} ({user.get('email')})"
            else:
                error_detail = response.json().get('detail', 'Unknown error') if response.content else f"HTTP {response.status_code}"
                message = f"Login failed: {error_detail}"
                
            self.log_test("User Login", success, message)
            return success
        except Exception as e:
            self.log_test("User Login", False, f"Error: {str(e)}")
            return False
    
    def test_get_current_user(self):
        """Test getting current user info"""
        if not self.token:
            self.log_test("Get Current User", False, "No auth token available")
            return False
            
        try:
            response = self.session.get(f"{self.base_url}/auth/me")
            success = response.status_code == 200
            
            if success:
                user = response.json()
                message = f"User info: {user.get('name')} - {user.get('subscription_status')} subscription"
            else:
                error_detail = response.json().get('detail', 'Unknown error') if response.content else f"HTTP {response.status_code}"
                message = f"Failed to get user info: {error_detail}"
                
            self.log_test("Get Current User", success, message)
            return success
        except Exception as e:
            self.log_test("Get Current User", False, f"Error: {str(e)}")
            return False
    
    def test_dashboard_stats(self):
        """Test dashboard stats endpoint"""
        if not self.token:
            self.log_test("Dashboard Stats", False, "No auth token available")
            return False
            
        try:
            response = self.session.get(f"{self.base_url}/dashboard/stats")
            success = response.status_code == 200
            
            if success:
                stats = response.json()
                message = f"Stats: {stats.get('pdf_count', 0)} PDFs, {stats.get('active_links', 0)} active links"
            else:
                error_detail = response.json().get('detail', 'Unknown error') if response.content else f"HTTP {response.status_code}"
                message = f"Failed to get dashboard stats: {error_detail}"
                
            self.log_test("Dashboard Stats", success, message)
            return success
        except Exception as e:
            self.log_test("Dashboard Stats", False, f"Error: {str(e)}")
            return False
    
    def test_logout(self):
        """Test user logout"""
        if not self.token:
            self.log_test("User Logout", False, "No auth token available")
            return False
            
        try:
            response = self.session.post(f"{self.base_url}/auth/logout")
            success = response.status_code == 200
            
            if success:
                message = "Successfully logged out"
                # Clear auth header
                if 'Authorization' in self.session.headers:
                    del self.session.headers['Authorization']
                self.token = None
            else:
                message = f"Logout failed with status {response.status_code}"
                
            self.log_test("User Logout", success, message)
            return success
        except Exception as e:
            self.log_test("User Logout", False, f"Error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Autodestroy PDF Platform API Tests")
        print(f"Testing endpoint: {self.base_url}")
        print("=" * 60)
        
        # Test order matters - some tests depend on others
        tests = [
            self.test_api_root,
            self.test_subscription_plans,
            self.test_user_registration,
            self.test_user_login,
            self.test_get_current_user,
            self.test_dashboard_stats,
            self.test_logout
        ]
        
        for test in tests:
            test()
        
        # Summary
        print("=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("⚠️  Some tests failed")
            return 1

def main():
    tester = AutodestroyPDFTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())