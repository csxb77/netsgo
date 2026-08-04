package server

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type userActionCapabilities struct {
	CanChangeAdmin    bool `json:"can_change_admin"`
	CanDisable        bool `json:"can_disable"`
	CanEnable         bool `json:"can_enable"`
	CanDelete         bool `json:"can_delete"`
	CanUpdateUsername bool `json:"can_update_username"`
	CanUpdatePassword bool `json:"can_update_password"`
	CanRevokeSessions bool `json:"can_revoke_sessions"`
}

type userResponse struct {
	ID          string                 `json:"id"`
	Username    string                 `json:"username"`
	IsAdmin     bool                   `json:"is_admin"`
	Status      UserStatus             `json:"status"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
	LastLogin   *time.Time             `json:"last_login,omitempty"`
	Operational bool                   `json:"operational"`
	Actions     userActionCapabilities `json:"actions,omitempty"`
}

type userPageResponse struct {
	Items      []userResponse `json:"items"`
	NextCursor *string        `json:"next_cursor"`
	HasMore    bool           `json:"has_more"`
}

func (s *Server) activeAdminCount() (int, error) {
	if s == nil || s.auth == nil || s.auth.adminStore == nil {
		return 0, ErrUserOwnerUnavailable
	}
	s.auth.adminStore.mu.RLock()
	defer s.auth.adminStore.mu.RUnlock()
	var count int
	if err := s.auth.adminStore.db.QueryRow(`SELECT COUNT(*) FROM users WHERE is_admin = 1 AND status = ?`, string(UserStatusActive)).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func userActionCapabilitiesFor(principal *RequestPrincipal, user User, activeAdminCount int) userActionCapabilities {
	if principal == nil || !principal.IsAdmin {
		return userActionCapabilities{}
	}
	self := principal.UserID == user.ID
	lastOperationalAdmin := user.IsAdmin && user.Status == UserStatusActive && activeAdminCount <= 1
	return userActionCapabilities{
		CanChangeAdmin:    !lastOperationalAdmin,
		CanDisable:        !self && user.Status == UserStatusActive && !lastOperationalAdmin,
		CanEnable:         !self && user.Status == UserStatusDisabled,
		CanDelete:         !self && user.Status == UserStatusDisabled,
		CanUpdateUsername: true,
		CanUpdatePassword: true,
		CanRevokeSessions: true,
	}
}

func userResponseFor(principal *RequestPrincipal, user User, activeAdminCount int) userResponse {
	return userResponse{
		ID:          user.ID,
		Username:    user.Username,
		IsAdmin:     user.IsAdmin,
		Status:      user.Status,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
		LastLogin:   user.LastLogin,
		Operational: isOperationalUser(user),
		Actions:     userActionCapabilitiesFor(principal, user, activeAdminCount),
	}
}

func (s *Server) handleAPIAuthMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	principal := GetPrincipalFromContext(r.Context())
	if principal == nil {
		writeAPIError(w, http.StatusUnauthorized, "session_expired_or_revoked", "session expired or revoked")
		return
	}
	user, err := s.auth.adminStore.GetUser(principal.UserID)
	if err != nil {
		writeAPIError(w, http.StatusUnauthorized, "session_expired_or_revoked", "session expired or revoked")
		return
	}
	activeAdmins, err := s.activeAdminCount()
	if err != nil {
		writeAPIError(w, http.StatusServiceUnavailable, "temporary_storage_failure", "temporary storage failure")
		return
	}
	encodeJSON(w, http.StatusOK, userResponseFor(principal, user, activeAdmins))
}

func parseUserListOptions(r *http.Request) (UserListOptions, error) {
	options := UserListOptions{Cursor: r.URL.Query().Get("cursor"), Query: r.URL.Query().Get("query")}
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit <= 0 {
			return UserListOptions{}, errors.New("limit must be a positive integer")
		}
		options.Limit = limit
	}
	if raw := r.URL.Query().Get("status"); raw != "" {
		status := UserStatus(raw)
		if status != UserStatusActive && status != UserStatusDisabled {
			return UserListOptions{}, ErrInvalidUserStatus
		}
		options.Status = &status
	}
	if raw := r.URL.Query().Get("is_admin"); raw != "" {
		value, err := strconv.ParseBool(raw)
		if err != nil {
			return UserListOptions{}, errors.New("is_admin must be true or false")
		}
		options.IsAdmin = &value
	}
	return options, nil
}

func (s *Server) handleAPIAdminUsers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		options, err := parseUserListOptions(r)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "invalid_user_list_query", err.Error())
			return
		}
		page, err := s.auth.adminStore.ListUsers(options)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "invalid_user_cursor", "invalid user cursor")
			return
		}
		principal := GetPrincipalFromContext(r.Context())
		activeAdmins, err := s.activeAdminCount()
		if err != nil {
			writeAPIError(w, http.StatusServiceUnavailable, "temporary_storage_failure", "temporary storage failure")
			return
		}
		response := userPageResponse{Items: make([]userResponse, 0, len(page.Items)), HasMore: page.HasMore}
		if page.NextCursor != "" {
			response.NextCursor = &page.NextCursor
		}
		for _, user := range page.Items {
			response.Items = append(response.Items, userResponseFor(principal, user, activeAdmins))
		}
		encodeJSON(w, http.StatusOK, response)
	case http.MethodPost:
		var request struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := decodeJSONRequestBody(r, &request); err != nil {
			writeJSONRequestDecodeError(w, err)
			return
		}
		user, activityID, err := s.auth.adminStore.CreateUserWithActivity(request.Username, request.Password, s.activityActorForRequest(r))
		if err != nil {
			if errors.Is(err, ErrUserAlreadyExists) {
				writeAPIError(w, http.StatusConflict, "username_taken", "username is already in use")
				return
			}
			writeAPIError(w, http.StatusBadRequest, "invalid_user", err.Error())
			return
		}
		s.publishActivityID(activityID)
		activeAdmins, err := s.activeAdminCount()
		if err != nil {
			writeAPIError(w, http.StatusServiceUnavailable, "temporary_storage_failure", "temporary storage failure")
			return
		}
		encodeJSON(w, http.StatusCreated, userResponseFor(GetPrincipalFromContext(r.Context()), user, activeAdmins))
	default:
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
	}
}

func (s *Server) targetUserForRequest(w http.ResponseWriter, r *http.Request) (User, bool) {
	userID := strings.TrimSpace(r.PathValue("user_id"))
	if userID == "" {
		writeAPIError(w, http.StatusBadRequest, "invalid_user_id", "user id is required")
		return User{}, false
	}
	user, err := s.auth.adminStore.GetUser(userID)
	if errors.Is(err, ErrUserNotFound) {
		writeAPIError(w, http.StatusNotFound, "user_not_found", "user not found")
		return User{}, false
	}
	if err != nil {
		writeAPIError(w, http.StatusServiceUnavailable, "temporary_storage_failure", "temporary storage failure")
		return User{}, false
	}
	return user, true
}

func (s *Server) handleAPIAdminUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	user, ok := s.targetUserForRequest(w, r)
	if !ok {
		return
	}
	activeAdmins, err := s.activeAdminCount()
	if err != nil {
		writeAPIError(w, http.StatusServiceUnavailable, "temporary_storage_failure", "temporary storage failure")
		return
	}
	encodeJSON(w, http.StatusOK, userResponseFor(GetPrincipalFromContext(r.Context()), user, activeAdmins))
}

func (s *Server) handleAPIAdminUserUsername(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	var request struct {
		Username string `json:"username"`
	}
	if err := decodeJSONRequestBody(r, &request); err != nil {
		writeJSONRequestDecodeError(w, err)
		return
	}
	user, activityID, err := s.auth.adminStore.UpdateUserUsernameWithActivity(r.PathValue("user_id"), request.Username, s.activityActorForRequest(r))
	if errors.Is(err, ErrUserNotFound) {
		writeAPIError(w, http.StatusNotFound, "user_not_found", "user not found")
		return
	}
	if errors.Is(err, ErrUserAlreadyExists) {
		writeAPIError(w, http.StatusConflict, "username_taken", "username is already in use")
		return
	}
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "invalid_user", err.Error())
		return
	}
	s.cancelSSEForUser(user.ID, "user_username_changed")
	s.publishActivityID(activityID)
	activeAdmins, _ := s.activeAdminCount()
	encodeJSON(w, http.StatusOK, userResponseFor(GetPrincipalFromContext(r.Context()), user, activeAdmins))
}

func (s *Server) handleAPIAdminUserPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	var request struct {
		Password string `json:"password"`
	}
	if err := decodeJSONRequestBody(r, &request); err != nil {
		writeJSONRequestDecodeError(w, err)
		return
	}
	user, activityID, err := s.auth.adminStore.ResetUserPasswordWithActivity(r.PathValue("user_id"), request.Password, s.activityActorForRequest(r))
	if errors.Is(err, ErrUserNotFound) {
		writeAPIError(w, http.StatusNotFound, "user_not_found", "user not found")
		return
	}
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "invalid_password", err.Error())
		return
	}
	s.cancelSSEForUser(user.ID, "user_password_reset")
	s.publishActivityID(activityID)
	activeAdmins, _ := s.activeAdminCount()
	encodeJSON(w, http.StatusOK, userResponseFor(GetPrincipalFromContext(r.Context()), user, activeAdmins))
}

func (s *Server) handleAPIAdminUserAdmin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	var request struct {
		IsAdmin *bool `json:"is_admin"`
	}
	if err := decodeJSONRequestBody(r, &request); err != nil || request.IsAdmin == nil {
		if err == nil {
			err = errors.New("is_admin is required")
		}
		writeAPIError(w, http.StatusBadRequest, "invalid_user_admin_state", err.Error())
		return
	}
	principal := GetPrincipalFromContext(r.Context())
	s.userManagementMu.Lock()
	user, changed, activityID, err := s.auth.adminStore.SetUserAdminWithActivity(principal.UserID, r.PathValue("user_id"), *request.IsAdmin, s.activityActorForRequest(r))
	s.userManagementMu.Unlock()
	if !writeUserLifecycleError(w, err) {
		return
	}
	if changed {
		s.cancelSSEForUser(user.ID, "user_admin_changed")
		s.publishActivityID(activityID)
	}
	activeAdmins, _ := s.activeAdminCount()
	encodeJSON(w, http.StatusOK, userResponseFor(principal, user, activeAdmins))
}

func (s *Server) handleAPIAdminUserDisable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	principal := GetPrincipalFromContext(r.Context())
	s.userManagementMu.Lock()
	user, changed, activityID, err := s.auth.adminStore.SetUserStatusWithActivity(principal.UserID, r.PathValue("user_id"), UserStatusDisabled, s.activityActorForRequest(r))
	s.userManagementMu.Unlock()
	if !writeUserLifecycleError(w, err) {
		return
	}
	s.cancelSSEForUser(user.ID, "user_disabled")
	if changed {
		s.publishActivityID(activityID)
	}
	// Status is committed before runtime convergence. New control/data channel
	// handshakes fail closed on the status check, while existing sessions are
	// actively torn down through the same lifecycle path as a disconnect.
	if changed {
		s.invalidateLogicalSessionsForUser(user.ID, "user_disabled")
	}
	activeAdmins, _ := s.activeAdminCount()
	encodeJSON(w, http.StatusOK, userResponseFor(principal, user, activeAdmins))
}

func (s *Server) handleAPIAdminUserEnable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	principal := GetPrincipalFromContext(r.Context())
	s.userManagementMu.Lock()
	user, changed, activityID, err := s.auth.adminStore.SetUserStatusWithActivity(principal.UserID, r.PathValue("user_id"), UserStatusActive, s.activityActorForRequest(r))
	s.userManagementMu.Unlock()
	if !writeUserLifecycleError(w, err) {
		return
	}
	if changed {
		s.publishActivityID(activityID)
	}
	activeAdmins, _ := s.activeAdminCount()
	encodeJSON(w, http.StatusOK, userResponseFor(principal, user, activeAdmins))
}

func (s *Server) handleAPIAdminUserDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	principal := GetPrincipalFromContext(r.Context())
	// A user can only be deleted after disable.  No new runtime session can be
	// admitted after that transition; converge any in-flight session before
	// removing the persisted ownership roots.
	s.invalidateLogicalSessionsForUser(r.PathValue("user_id"), "user_disabled")
	s.userManagementMu.Lock()
	err := s.auth.adminStore.DeleteDisabledUser(principal.UserID, r.PathValue("user_id"))
	s.userManagementMu.Unlock()
	if !writeUserLifecycleError(w, err) {
		return
	}
	s.cancelSSEForUser(r.PathValue("user_id"), "user_deleted")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAPIAdminUserSessionsRevoke(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAPIError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	if _, ok := s.targetUserForRequest(w, r); !ok {
		return
	}
	activityID, err := s.auth.adminStore.DeleteSessionsByUserIDWithActivity(r.PathValue("user_id"), s.activityActorForRequest(r))
	if err != nil {
		writeAPIError(w, http.StatusServiceUnavailable, "session_revoke_failed", "failed to revoke user sessions")
		return
	}
	s.cancelSSEForUser(r.PathValue("user_id"), "user_sessions_revoked")
	s.publishActivityID(activityID)
	encodeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func writeUserLifecycleError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return true
	}
	switch {
	case errors.Is(err, ErrUserNotFound):
		writeAPIError(w, http.StatusNotFound, "user_not_found", "user not found")
	case errors.Is(err, ErrUserMustBeDisabled):
		writeAPIError(w, http.StatusConflict, "user_must_be_disabled", "user must be disabled before deletion")
	case errors.Is(err, ErrSelfUserLifecycleMutation):
		writeAPIError(w, http.StatusConflict, "self_user_lifecycle_forbidden", "current user cannot be disabled or deleted")
	case errors.Is(err, ErrLastOperationalAdmin):
		writeAPIError(w, http.StatusConflict, "last_operational_admin", "at least one active administrator must remain")
	case errors.Is(err, ErrInvalidUserStatus):
		writeAPIError(w, http.StatusBadRequest, "invalid_user_status", "invalid user status")
	default:
		writeAPIError(w, http.StatusServiceUnavailable, "user_mutation_failed", "user mutation failed")
	}
	return false
}
