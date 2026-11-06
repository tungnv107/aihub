package service

import "context"

// GetByKeyForChRelay bypasses the authentication cache so revocation/expiry edits
// are observed on the next online check. The usual middleware still applies ACLs.
func (s *APIKeyService) GetByKeyForChRelay(ctx context.Context, key string) (*APIKey, error) {
	if len(key) == 0 || len(key) > MaxAPIKeyCredentialBytes {
		return nil, ErrAPIKeyNotFound
	}
	apiKey, err := s.apiKeyRepo.GetByKeyForAuth(ctx, key)
	if err != nil {
		return nil, err
	}
	s.compileAPIKeyIPRules(apiKey)
	return apiKey, nil
}
