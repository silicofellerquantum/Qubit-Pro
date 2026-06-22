import os
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
import app.routers.contact as contact_module

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_and_teardown(monkeypatch):
    # Mock send_email to succeed by default
    monkeypatch.setattr(contact_module, "send_email", lambda to, subj, body: True)
    # Reset rate limiting state
    contact_module.ip_history.clear()
    # Remove fallback file if exists
    if os.path.exists(contact_module.FALLBACK_FILE):
        try:
            os.remove(contact_module.FALLBACK_FILE)
        except Exception:
            pass
    yield
    # Cleanup after test
    if os.path.exists(contact_module.FALLBACK_FILE):
        try:
            os.remove(contact_module.FALLBACK_FILE)
        except Exception:
            pass

def test_valid_submission():
    payload = {
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "company": "Acme Corp",
        "message": "We need help designing quantum chips."
    }
    response = client.post("/api/contact", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "Thank you" in data["message"]

def test_invalid_email_format():
    payload = {
        "name": "Ada Lovelace",
        "email": "invalid-email",
        "message": "We need help designing quantum chips."
    }
    response = client.post("/api/contact", json=payload)
    assert response.status_code == 400
    data = response.json()
    assert "Invalid email" in data["detail"]

def test_short_name():
    payload = {
        "name": "A",
        "email": "ada@example.com",
        "message": "We need help designing quantum chips."
    }
    response = client.post("/api/contact", json=payload)
    # FastAPI returns 422 Unprocessable Entity for Pydantic field validation errors
    assert response.status_code == 422

def test_short_message():
    payload = {
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "message": "Too short"
    }
    response = client.post("/api/contact", json=payload)
    assert response.status_code == 422

def test_input_sanitization(monkeypatch):
    received_emails = []
    def mock_send(to, subj, html_content):
        received_emails.append(html_content)
        return True
    
    monkeypatch.setattr(contact_module, "send_email", mock_send)
    
    payload = {
        "name": "<script>alert(1)</script>Ada",
        "email": "ada@example.com",
        "message": "Designing quantum <p>chips</p> is fun & games."
    }
    response = client.post("/api/contact", json=payload)
    assert response.status_code == 200
    
    # Verify that tags were stripped and special characters escaped
    # "<script>" stripped completely, message tags stripped. "&amp;" for "&"
    assert len(received_emails) > 0
    html_content = received_emails[0]
    assert "<script>" not in html_content
    assert "</script>" not in html_content
    assert "<p>" not in html_content
    assert "</p>" not in html_content
    assert "fun &amp; games" in html_content
    assert "alert(1)Ada" in html_content

def test_spam_keywords():
    payload = {
        "name": "Spammer",
        "email": "spam@example.com",
        "message": "Get rich quick with our cheap slots and online casino now!"
    }
    response = client.post("/api/contact", json=payload)
    assert response.status_code == 400
    assert "flagged" in response.json()["detail"]

def test_spam_excessive_urls():
    payload = {
        "name": "Spammer",
        "email": "spam@example.com",
        "message": "Check out our sites: http://site1.com, https://site2.org, and http://site3.net"
    }
    response = client.post("/api/contact", json=payload)
    assert response.status_code == 400
    assert "flagged" in response.json()["detail"]

def test_rate_limiting():
    payload = {
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "message": "We need help designing quantum chips."
    }
    # Send 5 valid requests
    for _ in range(5):
        response = client.post("/api/contact", json=payload)
        assert response.status_code == 200
        
    # The 6th request from the same IP (TestClient defaults to 127.0.0.1) should fail with 429
    response = client.post("/api/contact", json=payload)
    assert response.status_code == 429
    assert "Too many requests" in response.json()["detail"]

def test_offline_fallback(monkeypatch):
    # Mock send_email to fail
    monkeypatch.setattr(contact_module, "send_email", lambda to, subj, body: False)
    
    payload = {
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "message": "We need help designing quantum chips."
    }
    response = client.post("/api/contact", json=payload)
    assert response.status_code == 500
    assert "Failed to send email" in response.json()["detail"]
    
    # Check if logged in fallback file
    assert os.path.exists(contact_module.FALLBACK_FILE)
    with open(contact_module.FALLBACK_FILE, "r", encoding="utf-8") as f:
        fallback_data = json.load(f)
    assert len(fallback_data) == 1
    assert fallback_data[0]["name"] == "Ada Lovelace"
    assert fallback_data[0]["email"] == "ada@example.com"
