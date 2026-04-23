ALTER TABLE transfer_requests 
ADD COLUMN created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_transfer_requests_user ON transfer_requests(created_by_user_id);
