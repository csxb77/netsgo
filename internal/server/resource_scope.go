package server

import (
	"context"
	"net/http"
)

// ResourceScope is the explicit owner scope injected by routing.  Handlers
// must use it for every resource lookup instead of inferring global access
// from an administrator principal.
type ResourceScope struct {
	OwnerUserID string
	AdminTarget bool
}

type resourceScopeContextKey struct{}

func resourceScopeFromContext(ctx context.Context) (ResourceScope, bool) {
	scope, ok := ctx.Value(resourceScopeContextKey{}).(ResourceScope)
	return scope, ok && scope.OwnerUserID != ""
}

func (s *Server) requireSelfResourceScope(next http.HandlerFunc) http.HandlerFunc {
	return s.RequirePrincipal(func(w http.ResponseWriter, r *http.Request) {
		principal := GetPrincipalFromContext(r.Context())
		if principal == nil {
			writeAPIError(w, http.StatusUnauthorized, "session_expired_or_revoked", "session expired or revoked")
			return
		}
		ctx := context.WithValue(r.Context(), resourceScopeContextKey{}, ResourceScope{OwnerUserID: principal.UserID})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) requireAdminUserResourceScope(next http.HandlerFunc) http.HandlerFunc {
	return s.RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
		user, ok := s.targetUserForRequest(w, r)
		if !ok {
			return
		}
		ctx := context.WithValue(r.Context(), resourceScopeContextKey{}, ResourceScope{OwnerUserID: user.ID, AdminTarget: true})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireAdminSelfResourceScope keeps legacy administrator-only resource
// routes explicit: an administrator using those routes operates on their own
// resources, never on an implicit global collection.
func (s *Server) requireAdminSelfResourceScope(next http.HandlerFunc) http.HandlerFunc {
	return s.RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
		principal := GetPrincipalFromContext(r.Context())
		if principal == nil {
			writeAPIError(w, http.StatusUnauthorized, "session_expired_or_revoked", "session expired or revoked")
			return
		}
		ctx := context.WithValue(r.Context(), resourceScopeContextKey{}, ResourceScope{OwnerUserID: principal.UserID})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func requireResourceScope(w http.ResponseWriter, r *http.Request) (ResourceScope, bool) {
	scope, ok := resourceScopeFromContext(r.Context())
	if !ok {
		writeAPIError(w, http.StatusInternalServerError, "resource_scope_missing", "resource scope is unavailable")
	}
	return scope, ok
}
