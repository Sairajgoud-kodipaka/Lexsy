"""
Legal Document Automation Platform - Main Flask Application
============================================================
This is the core Flask application that handles all API endpoints for document
processing, AI conversations, and document generation.

Author: Legal Tech Solutions
Date: October 2025
Version: 1.0.0
"""

import os
import json
import uuid
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

from flask import Flask, render_template, request, jsonify, send_file, session, make_response
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge
from dotenv import load_dotenv
import secrets

# Import our custom services
from services.document_processor import DocumentProcessor
from services.ai_service import AIService
from services.placeholder_detector import PlaceholderDetector

# Load environment variables from .env file
load_dotenv()

# Initialize Flask application
app = Flask(__name__)

# Configure Flask application
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_FILE_SIZE', 10 * 1024 * 1024))  # 10MB default
app.config['UPLOAD_FOLDER'] = os.environ.get('UPLOAD_FOLDER', 'uploads')
app.config['PROCESSED_FOLDER'] = os.environ.get('PROCESSED_FOLDER', 'processed')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)  # Sessions expire after 24 hours

# Configure CORS for cross-origin requests
# Allow all localhost origins for development with dynamic origin matching
allowed_origins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002'
]

def cors_check(origin):
    """Check if origin is allowed"""
    return origin in allowed_origins

CORS(app, 
     origins=allowed_origins,
     origin_check=cors_check,
     supports_credentials=True,
     methods=['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
     allow_headers=['Content-Type', 'Authorization', 'X-Requested-With'],
     expose_headers=['Content-Type', 'Content-Disposition'],
     max_age=3600)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Ensure required directories exist
for folder in [app.config['UPLOAD_FOLDER'], app.config['PROCESSED_FOLDER'], 'logs']:
    Path(folder).mkdir(parents=True, exist_ok=True)

# Initialize services
doc_processor = DocumentProcessor()
ai_service = AIService()
placeholder_detector = PlaceholderDetector()

# Allowed file extensions for upload
ALLOWED_EXTENSIONS = {'docx', 'doc'}

# In-memory session store (use Redis in production)
session_store = {}


def allowed_file(filename: str) -> bool:
    """
    Check if the uploaded file has an allowed extension.
    
    Args:
        filename (str): Name of the file to check
        
    Returns:
        bool: True if file extension is allowed, False otherwise
    """
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_session_data(session_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve session data from storage.
    
    Args:
        session_id (str): Unique session identifier
        
    Returns:
        Optional[Dict]: Session data if found, None otherwise
    """
    return session_store.get(session_id)


def save_session_data(session_id: str, data: Dict[str, Any]) -> None:
    """
    Save session data to storage.
    
    Args:
        session_id (str): Unique session identifier
        data (Dict): Session data to save
    """
    session_store[session_id] = data
    # Clean up old sessions (simple implementation - use Redis TTL in production)
    cleanup_old_sessions()


def cleanup_old_sessions() -> None:
    """
    Remove expired sessions from storage.
    Sessions older than 24 hours are removed.
    """
    current_time = datetime.now()
    expired_sessions = []
    
    for sid, data in session_store.items():
        if 'created_at' in data:
            created_at = datetime.fromisoformat(data['created_at'])
            if current_time - created_at > timedelta(hours=24):
                expired_sessions.append(sid)
    
    for sid in expired_sessions:
        # Clean up files
        if sid in session_store and 'filepath' in session_store[sid]:
            try:
                os.remove(session_store[sid]['filepath'])
            except:
                pass
        del session_store[sid]


@app.route('/')
def index():
    """
    Root endpoint - returns API information.
    """
    return jsonify({
        'name': 'Legal Document Automation API',
        'version': '1.0.0',
        'status': 'operational',
        'endpoints': [
            '/api/upload',
            '/api/chat',
            '/api/preview',
            '/api/complete',
            '/api/download/<filename>',
            '/api/reset',
            '/api/health'
        ]
    })


@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint for monitoring.
    Used by deployment platforms to verify the service is running.
    
    Returns:
        JSON response with service status
    """
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'service': 'Legal Document Automation Platform',
        'version': '1.0.0',
        'uptime': 'operational'
    })


@app.route('/api/upload', methods=['POST'])
def upload_document():
    """
    Handle document upload and initial processing.
    
    This endpoint:
    1. Validates the uploaded file
    2. Saves it to the upload directory
    3. Processes the document to extract content
    4. Detects placeholders
    5. Initializes a conversation session
    
    Returns:
        JSON response with session information and detected placeholders
    """
    try:
        # Validate file presence in request
        if 'document' not in request.files:
            logger.warning("Upload attempt with no document provided")
            return jsonify({
                'error': 'No document provided',
                'message': 'Please select a file to upload'
            }), 400
        
        file = request.files['document']
        
        # Validate file selection
        if file.filename == '':
            logger.warning("Upload attempt with empty filename")
            return jsonify({
                'error': 'No file selected',
                'message': 'Please select a valid document file'
            }), 400
        
        # Validate file type
        if not allowed_file(file.filename):
            logger.warning(f"Upload attempt with invalid file type: {file.filename}")
            return jsonify({
                'error': 'Invalid file format',
                'message': 'Please upload a .docx file. Other formats are not supported yet.'
            }), 400
        
        # Generate unique session ID
        session_id = str(uuid.uuid4())
        logger.info(f"Created new session: {session_id}")
        
        # Secure the filename and create unique path
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_filename = f"{session_id}_{timestamp}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        
        # Save the uploaded file
        file.save(filepath)
        logger.info(f"Saved uploaded file: {unique_filename}")
        
        # Process document to extract content and structure
        logger.info(f"Processing document: {unique_filename}")
        doc_content = doc_processor.parse_document(filepath)
        
        if not doc_content:
            logger.error(f"Failed to parse document: {unique_filename}")
            return jsonify({
                'error': 'Document processing failed',
                'message': 'Unable to read the document. Please ensure it\'s a valid .docx file.'
            }), 500
        
        # Detect placeholders in the document
        placeholders = placeholder_detector.detect_placeholders(doc_content)
        logger.info(f"Detected {len(placeholders)} placeholders in document")
        
        # Initialize AI conversation context
        ai_context = ai_service.initialize_conversation(doc_content, placeholders)
        
        # Store session data
        session_data = {
            'session_id': session_id,
            'filepath': filepath,
            'filename': filename,
            'content': doc_content,
            'placeholders': placeholders,
            'filled_values': {},
            'current_placeholder_index': 0,
            'ai_context': ai_context,
            'conversation_history': [],
            'created_at': datetime.now().isoformat(),
            'status': 'active'
        }
        
        save_session_data(session_id, session_data)
        
        # Prepare response
        response_data = {
            'success': True,
            'session_id': session_id,
            'filename': filename,
            'placeholders_count': len(placeholders),
            'placeholders': placeholders,
            'message': f'Document uploaded successfully. Found {len(placeholders)} placeholder{"s" if len(placeholders) != 1 else ""} to fill.',
            'initial_message': ai_service.get_greeting_message(placeholders)
        }
        
        logger.info(f"Upload successful for session {session_id}")
        return jsonify(response_data), 200
        
    except RequestEntityTooLarge:
        logger.error("File too large uploaded")
        return jsonify({
            'error': 'File too large',
            'message': f'File size exceeds the maximum limit of {app.config["MAX_CONTENT_LENGTH"] / (1024*1024):.1f}MB'
        }), 413
        
    except Exception as e:
        logger.error(f"Error processing upload: {str(e)}")
        return jsonify({
            'error': 'Processing error',
            'message': 'An unexpected error occurred while processing your document. Please try again.'
        }), 500


@app.route('/api/chat', methods=['POST'])
def chat():
    """
    Handle conversational interactions for filling placeholders.
    
    This endpoint:
    1. Processes user messages
    2. Validates inputs based on placeholder type
    3. Updates filled values
    4. Generates AI responses for next placeholder
    
    Returns:
        JSON response with AI message and progress information
    """
    try:
        data = request.json
        user_message = data.get('message', '').strip()
        session_id = data.get('session_id')
        
        if not session_id:
            logger.warning("Chat request without session_id")
            return jsonify({
                'error': 'No session found',
                'message': 'Please upload a document first to start a conversation.'
            }), 400
        
        # Retrieve session data
        session_data = get_session_data(session_id)
        if not session_data:
            logger.warning(f"Chat request with invalid session_id: {session_id}")
            return jsonify({
                'error': 'Session expired',
                'message': 'Your session has expired. Please upload the document again.'
            }), 400
        
        # Extract session information
        placeholders = session_data['placeholders']
        filled_values = session_data['filled_values']
        current_index = session_data['current_placeholder_index']
        ai_context = session_data['ai_context']
        conversation_history = session_data.get('conversation_history', [])
        
        # Add user message to history
        conversation_history.append({
            'role': 'user',
            'content': user_message,
            'timestamp': datetime.now().isoformat()
        })
        
        # Process user message with AI
        response = ai_service.process_message(
            user_message=user_message,
            placeholders=placeholders,
            filled_values=filled_values,
            current_index=current_index,
            ai_context=ai_context
        )
        
        # Update session based on response
        if response.get('placeholder_filled'):
            placeholder_key = response['placeholder_key']
            filled_values[placeholder_key] = response['value']
            session_data['filled_values'] = filled_values
            session_data['current_placeholder_index'] = current_index + 1
            
            logger.info(f"Filled placeholder {placeholder_key} with value: {response['value'][:50]}...")
            
            # Handle auto-fills (e.g., duplicate Company Name in header)
            if 'auto_fills' in response:
                for auto_fill in response['auto_fills']:
                    filled_values[auto_fill['key']] = auto_fill['value']
                    session_data['filled_values'] = filled_values
                    logger.info(f"Auto-filled {auto_fill['key']} with value: {auto_fill['value'][:50]}...")
        
        # Add AI response to history
        conversation_history.append({
            'role': 'assistant',
            'content': response['message'],
            'timestamp': datetime.now().isoformat()
        })
        
        session_data['conversation_history'] = conversation_history
        save_session_data(session_id, session_data)
        
        # Check if all placeholders are filled
        all_filled = len(filled_values) == len(placeholders)
        
        # Generate fresh preview HTML to return with response
        current_preview_index = session_data['current_placeholder_index']
        preview_html = doc_processor.generate_preview(
            content=session_data['content'],
            placeholders=placeholders,
            filled_values=filled_values,
            current_index=current_preview_index if current_preview_index < len(placeholders) else None
        )
        
        # Prepare response
        response_data = {
            'response': response['message'],
            'placeholder_filled': response.get('placeholder_filled', False),
            'current_progress': session_data['current_placeholder_index'],
            'total_placeholders': len(placeholders),
            'progress_percentage': round((len(filled_values) / len(placeholders) * 100), 1) if placeholders else 0,
            'all_filled': all_filled,
            'filled_values': filled_values,
            'current_placeholder': placeholders[current_preview_index] if current_preview_index < len(placeholders) else None,
            'preview': preview_html  # NEW: fresh preview with each response
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return jsonify({
            'error': 'Chat processing error',
            'message': 'An error occurred while processing your message. Please try again.'
        }), 500


@app.route('/api/edit', methods=['POST'])
def edit_field():
    """
    Edit a previously filled field value.
    
    This endpoint allows users to go back and edit any filled field.
    
    Returns:
        JSON response with updated preview and confirmation
    """
    try:
        data = request.json
        session_id = data.get('session_id')
        field_key = data.get('field_key')
        new_value = data.get('value', '').strip()
        
        if not session_id:
            return jsonify({
                'error': 'No session found',
                'message': 'Please upload a document first.'
            }), 400
        
        if not field_key:
            return jsonify({
                'error': 'No field specified',
                'message': 'Please specify which field to edit.'
            }), 400
        
        # Retrieve session data
        session_data = get_session_data(session_id)
        if not session_data:
            return jsonify({
                'error': 'Session expired',
                'message': 'Your session has expired. Please upload the document again.'
            }), 400
        
        placeholders = session_data['placeholders']
        filled_values = session_data['filled_values']
        
        # Find the placeholder
        placeholder = next((p for p in placeholders if p['key'] == field_key), None)
        if not placeholder:
            return jsonify({
                'error': 'Field not found',
                'message': 'The specified field does not exist.'
            }), 400
        
        # Validate the new value
        validation_result = ai_service._validate_placeholder_value(new_value, placeholder)
        
        if not validation_result['valid']:
            return jsonify({
                'error': 'Invalid value',
                'message': validation_result['error_message']
            }), 400
        
        # Update the value
        filled_values[field_key] = validation_result['processed_value']
        session_data['filled_values'] = filled_values
        
        # Update current index to this field if needed (allow editing any field)
        field_index = next((i for i, p in enumerate(placeholders) if p['key'] == field_key), None)
        if field_index is not None:
            session_data['current_placeholder_index'] = field_index
        
        save_session_data(session_id, session_data)
        
        # Generate updated preview
        current_index = len(filled_values) if len(filled_values) < len(placeholders) else None
        preview_html = doc_processor.generate_preview(
            content=session_data['content'],
            placeholders=placeholders,
            filled_values=filled_values,
            current_index=current_index
        )
        
        # Prepare response
        response_data = {
            'success': True,
            'message': f'Field "{placeholder.get("name", "Field")}" updated successfully.',
            'preview': preview_html,
            'filled_count': len(filled_values),
            'total_count': len(placeholders),
            'progress_percentage': round(
                (len(filled_values) / len(placeholders) * 100), 1
            ) if placeholders else 0,
            'filled_values': filled_values,
            'current_index': current_index
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.error(f"Error editing field: {str(e)}")
        return jsonify({
            'error': 'Edit processing error',
            'message': 'An error occurred while updating the field. Please try again.'
        }), 500


@app.route('/api/preview', methods=['GET'])
def preview_document():
    """
    Generate and return a preview of the document with current filled values.
    
    Returns:
        JSON response with HTML preview of the document
    """
    try:
        session_id = request.args.get('session_id')
        
        if not session_id:
            return jsonify({
                'error': 'No session specified',
                'message': 'Session ID is required for preview.'
            }), 400
        
        # Retrieve session data
        session_data = get_session_data(session_id)
        if not session_data:
            return jsonify({
                'error': 'Session not found',
                'message': 'Session expired or invalid. Please upload the document again.'
            }), 400
        
        # Get current field index (for highlighting)
        current_index = session_data.get('current_placeholder_index', None)
        filled_count = len(session_data['filled_values'])
        
        # Current index should be based on filled count (next field to fill)
        if current_index is None:
            current_index = filled_count if filled_count < len(session_data['placeholders']) else None
        
        # Generate preview with current field highlighting
        preview_html = doc_processor.generate_preview(
            content=session_data['content'],
            placeholders=session_data['placeholders'],
            filled_values=session_data['filled_values'],
            current_index=current_index
        )
        
        # Prepare response
        response_data = {
            'preview': preview_html,
            'filled_count': filled_count,
            'total_count': len(session_data['placeholders']),
            'progress_percentage': round(
                (filled_count / len(session_data['placeholders']) * 100), 1
            ) if session_data['placeholders'] else 0,
            'placeholders': session_data['placeholders'],
            'filled_values': session_data['filled_values'],
            'current_index': current_index
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.error(f"Error generating preview: {str(e)}")
        return jsonify({
            'error': 'Preview generation error',
            'message': 'Unable to generate document preview. Please try again.'
        }), 500


@app.route('/api/complete', methods=['POST'])
def complete_document():
    """
    Generate the final document with all filled values.
    
    This endpoint:
    1. Validates all placeholders are filled
    2. Generates the final document
    3. Saves it to the processed folder
    4. Returns download information
    
    Returns:
        JSON response with download URL
    """
    try:
        data = request.json
        session_id = data.get('session_id')
        
        if not session_id:
            return jsonify({
                'error': 'No session specified',
                'message': 'Session ID is required to complete the document.'
            }), 400
        
        # Retrieve session data
        session_data = get_session_data(session_id)
        if not session_data:
            return jsonify({
                'error': 'Session not found',
                'message': 'Session expired or invalid. Please upload the document again.'
            }), 400
        
        # Validate all placeholders are filled
        placeholders = session_data['placeholders']
        filled_values = session_data['filled_values']
        
        if len(filled_values) < len(placeholders):
            unfilled = [p for p in placeholders if p['key'] not in filled_values]
            unfilled_names = [p['name'] for p in unfilled[:5]]  # Show first 5 unfilled
            
            return jsonify({
                'error': 'Incomplete document',
                'message': f'Please fill all placeholders before downloading. Still missing: {", ".join(unfilled_names)}{"..." if len(unfilled) > 5 else ""}',
                'unfilled_count': len(unfilled),
                'unfilled_placeholders': unfilled
            }), 400
        
        # Generate output filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        original_name = session_data['filename'].rsplit('.', 1)[0]
        output_filename = f"completed_{original_name}_{timestamp}.docx"
        output_path = os.path.join(app.config['PROCESSED_FOLDER'], output_filename)
        
        # Generate final document
        logger.info(f"Generating final document for session {session_id}")
        
        # 🔍 DEBUG: Log all placeholders and their values
        logger.info("="*80)
        logger.info("DOCUMENT COMPLETION DEBUG")
        logger.info("="*80)
        logger.info(f"Total placeholders: {len(placeholders)}")
        
        # Check for dollar placeholders specifically
        dollar_placeholders = [p for p in placeholders if '$' in p.get('original', '')]
        logger.info(f"\nDollar placeholders ({len(dollar_placeholders)}):")
        for p in dollar_placeholders:
            logger.info(f"  {p['name']}")
            logger.info(f"    Key: {p['key']}")
            logger.info(f"    Location: {p['location']} ({p['location_type']})")
            logger.info(f"    Original: {p['original']}")
            logger.info(f"    Value in filled_values: {filled_values.get(p['key'], 'NOT FOUND')}")
        
        logger.info("\nAll filled values:")
        for key, value in filled_values.items():
            logger.info(f"  {key} = {value}")
        logger.info("="*80)
        
        success = doc_processor.generate_final_document(
            template_path=session_data['filepath'],
            output_path=output_path,
            placeholders=placeholders,
            filled_values=filled_values
        )
        
        if not success:
            logger.error(f"Failed to generate final document for session {session_id}")
            return jsonify({
                'error': 'Document generation failed',
                'message': 'Unable to generate the final document. Please try again.'
            }), 500
        
        # Update session data
        session_data['completed_document'] = output_path
        session_data['completed_at'] = datetime.now().isoformat()
        session_data['status'] = 'completed'
        save_session_data(session_id, session_data)
        
        logger.info(f"Document completed successfully: {output_filename}")
        
        return jsonify({
            'success': True,
            'download_url': f'/api/download/{output_filename}',
            'filename': output_filename,
            'message': 'Document completed successfully! Click the download button to save your file.'
        }), 200
        
    except Exception as e:
        logger.error(f"Error completing document: {str(e)}")
        return jsonify({
            'error': 'Completion error',
            'message': 'An error occurred while generating the final document. Please try again.'
        }), 500


@app.route('/api/download/<filename>')
def download_document(filename):
    """
    Download the completed document.
    
    Args:
        filename (str): Name of the file to download
        
    Returns:
        File download response
    """
    try:
        # Secure the filename
        filename = secure_filename(filename)
        filepath = os.path.join(app.config['PROCESSED_FOLDER'], filename)
        
        # Check if file exists
        if not os.path.exists(filepath):
            logger.warning(f"Download attempt for non-existent file: {filename}")
            return jsonify({
                'error': 'File not found',
                'message': 'The requested file could not be found. It may have expired.'
            }), 404
        
        # Send file
        logger.info(f"Downloading file: {filename}")
        return send_file(
            filepath,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        
    except Exception as e:
        logger.error(f"Error downloading document: {str(e)}")
        return jsonify({
            'error': 'Download error',
            'message': 'Unable to download the file. Please try again.'
        }), 500


@app.route('/api/reset', methods=['POST'])
def reset_session():
    """
    Reset the current session and clean up resources.
    
    Returns:
        JSON response confirming reset
    """
    try:
        data = request.json
        session_id = data.get('session_id')
        
        if session_id and session_id in session_store:
            # Clean up uploaded file
            if 'filepath' in session_store[session_id]:
                try:
                    os.remove(session_store[session_id]['filepath'])
                    logger.info(f"Cleaned up file for session {session_id}")
                except:
                    pass
            
            # Remove session data
            del session_store[session_id]
            logger.info(f"Reset session: {session_id}")
        
        return jsonify({
            'success': True,
            'message': 'Session reset successfully. You can now upload a new document.'
        }), 200
        
    except Exception as e:
        logger.error(f"Error resetting session: {str(e)}")
        return jsonify({
            'error': 'Reset error',
            'message': 'Unable to reset session. Please refresh the page.'
        }), 500


@app.errorhandler(413)
def request_entity_too_large(error):
    """
    Handle file too large errors.
    
    Returns:
        JSON error response for oversized files
    """
    return jsonify({
        'error': 'File too large',
        'message': f'The uploaded file exceeds the maximum size limit of {app.config["MAX_CONTENT_LENGTH"] / (1024*1024):.1f}MB. Please upload a smaller file.'
    }), 413


@app.errorhandler(500)
def internal_server_error(error):
    """
    Handle internal server errors.
    
    Returns:
        JSON error response for server errors
    """
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({
        'error': 'Internal server error',
        'message': 'An unexpected error occurred. Our team has been notified. Please try again later.'
    }), 500


@app.before_request
def before_request():
    """
    Execute before each request.
    Used for request logging and validation.
    """
    logger.info(f"{request.method} {request.path} from {request.remote_addr}")


@app.after_request
def after_request(response):
    """
    Execute after each request.
    Add security headers and log response.
    
    Args:
        response: Flask response object
        
    Returns:
        Modified response with additional headers
    """
    # CORS headers are handled by flask-cors extension
    # Flask-CORS automatically sets the correct headers based on the requesting origin
    
    # Add security headers
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    
    # Only add HSTS in production
    if os.environ.get('FLASK_ENV') != 'development':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    
    return response


if __name__ == '__main__':
    """
    Run the Flask application.
    In production, use Gunicorn or similar WSGI server.
    """
    port = int(os.environ.get('PORT', 5001))  # Default to 5001 to avoid macOS AirPlay conflict
    debug = os.environ.get('FLASK_ENV', 'development') == 'development'
    
    logger.info(f"Starting Legal Document Automation Platform on port {port}")
    logger.info(f"Debug mode: {debug}")
    logger.info(f"CORS enabled for: http://localhost:3000, http://localhost:3001")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug
    )