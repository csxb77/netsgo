package server

import (
	"encoding/json"
	"net/http"
	"testing"
)

func requireUserAPIErrorCode(t *testing.T, responseBody []byte, want string) {
	t.Helper()
	var response apiErrorResponse
	if err := json.Unmarshal(responseBody, &response); err != nil {
		t.Fatalf("decode API error response: %v", err)
	}
	if response.Code != want {
		t.Fatalf("API error code = %q, want %q (body %s)", response.Code, want, responseBody)
	}
}

func TestAPIUserManagementContract(t *testing.T) {
	_, handler, adminToken, cleanup := setupTestServerWithStores(t, true)
	defer cleanup()

	create := doMuxRequest(t, handler, http.MethodPost, "/api/admin/users", adminToken, []byte(`{"username":"alice","password":"Alice1234"}`))
	if create.Code != http.StatusCreated {
		t.Fatalf("create user status = %d, want %d: %s", create.Code, http.StatusCreated, create.Body.String())
	}
	var created userResponse
	if err := json.Unmarshal(create.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created user: %v", err)
	}
	if created.ID == "" || created.Username != "alice" || created.IsAdmin || created.Status != UserStatusActive || !created.Operational {
		t.Fatalf("created user = %+v, want active non-administrator alice", created)
	}
	var createdPayload map[string]json.RawMessage
	if err := json.Unmarshal(create.Body.Bytes(), &createdPayload); err != nil {
		t.Fatalf("decode created user payload: %v", err)
	}
	for _, forbidden := range []string{"password_hash", "totp_secret", "session_id", "api_key", "client_token"} {
		if _, exists := createdPayload[forbidden]; exists {
			t.Fatalf("user DTO must not expose %q", forbidden)
		}
	}
	var actions map[string]json.RawMessage
	if err := json.Unmarshal(createdPayload["actions"], &actions); err != nil {
		t.Fatalf("decode user action capabilities: %v", err)
	}
	for _, key := range []string{"can_change_admin", "can_disable", "can_enable", "can_delete", "can_update_username", "can_update_password", "can_revoke_sessions"} {
		if _, exists := actions[key]; !exists {
			t.Fatalf("user action capabilities missing %q: %s", key, createdPayload["actions"])
		}
	}

	list := doMuxRequest(t, handler, http.MethodGet, "/api/admin/users?status=active&is_admin=false&limit=1", adminToken, nil)
	if list.Code != http.StatusOK {
		t.Fatalf("list users status = %d, want %d: %s", list.Code, http.StatusOK, list.Body.String())
	}
	var listed userPageResponse
	if err := json.Unmarshal(list.Body.Bytes(), &listed); err != nil {
		t.Fatalf("decode user list: %v", err)
	}
	if len(listed.Items) != 1 || listed.Items[0].ID != created.ID || listed.Items[0].IsAdmin {
		t.Fatalf("filtered user list = %+v, want only created ordinary user", listed)
	}

	userToken := loginAdminTokenLocal(t, handler, "alice", "Alice1234")
	forbidden := doMuxRequest(t, handler, http.MethodGet, "/api/admin/users", userToken, nil)
	if forbidden.Code != http.StatusForbidden {
		t.Fatalf("regular user admin list status = %d, want %d: %s", forbidden.Code, http.StatusForbidden, forbidden.Body.String())
	}
	requireUserAPIErrorCode(t, forbidden.Body.Bytes(), "administrator_access_required")

	me := doMuxRequest(t, handler, http.MethodGet, "/api/auth/me", userToken, nil)
	if me.Code != http.StatusOK {
		t.Fatalf("regular user auth/me status = %d, want %d: %s", me.Code, http.StatusOK, me.Body.String())
	}
	var principal struct {
		ID       string `json:"id"`
		Username string `json:"username"`
		IsAdmin  bool   `json:"is_admin"`
	}
	if err := json.Unmarshal(me.Body.Bytes(), &principal); err != nil {
		t.Fatalf("decode auth/me: %v", err)
	}
	if principal.ID != created.ID || principal.Username != created.Username || principal.IsAdmin {
		t.Fatalf("auth/me = %+v, want alice non-administrator", principal)
	}

	promotion := doMuxRequest(t, handler, http.MethodPut, "/api/admin/users/"+created.ID+"/admin", adminToken, []byte(`{"is_admin":true}`))
	if promotion.Code != http.StatusOK {
		t.Fatalf("promote alice status = %d, want %d: %s", promotion.Code, http.StatusOK, promotion.Body.String())
	}
	// The original administrator may now self-demote, but a second attempt to
	// remove the final active administrator must still fail deterministically.
	var promoted userResponse
	if err := json.Unmarshal(promotion.Body.Bytes(), &promoted); err != nil {
		t.Fatalf("decode promoted user: %v", err)
	}
	if !promoted.IsAdmin {
		t.Fatalf("promoted user = %+v, want administrator", promoted)
	}

	adminSelfDemote := doMuxRequest(t, handler, http.MethodPut, "/api/admin/users/"+created.ID+"/admin", userToken, []byte(`{"is_admin":false}`))
	if adminSelfDemote.Code != http.StatusUnauthorized {
		t.Fatalf("revoked former user session status = %d, want %d: %s", adminSelfDemote.Code, http.StatusUnauthorized, adminSelfDemote.Body.String())
	}

	// The promotion revoked alice's original session.  Login again as an admin
	// and demote the original administrator, leaving alice as the last admin.
	aliceAdminToken := loginAdminTokenLocal(t, handler, "alice", "Alice1234")
	adminList := doMuxRequest(t, handler, http.MethodGet, "/api/admin/users", aliceAdminToken, nil)
	if adminList.Code != http.StatusOK {
		t.Fatalf("promoted user admin list status = %d, want %d: %s", adminList.Code, http.StatusOK, adminList.Body.String())
	}

	// Use the current list to identify the initialized administrator rather
	// than assuming a generated UUID.
	var all userPageResponse
	if err := json.Unmarshal(adminList.Body.Bytes(), &all); err != nil {
		t.Fatalf("decode administrators list: %v", err)
	}
	var initialAdminID string
	for _, user := range all.Items {
		if user.ID != created.ID && user.IsAdmin {
			initialAdminID = user.ID
			break
		}
	}
	if initialAdminID == "" {
		t.Fatal("initialized administrator not found in user list")
	}
	if demote := doMuxRequest(t, handler, http.MethodPut, "/api/admin/users/"+initialAdminID+"/admin", aliceAdminToken, []byte(`{"is_admin":false}`)); demote.Code != http.StatusOK {
		t.Fatalf("demote original administrator status = %d, want %d: %s", demote.Code, http.StatusOK, demote.Body.String())
	}
	lastAdmin := doMuxRequest(t, handler, http.MethodPut, "/api/admin/users/"+created.ID+"/admin", aliceAdminToken, []byte(`{"is_admin":false}`))
	if lastAdmin.Code != http.StatusConflict {
		t.Fatalf("demote final active administrator status = %d, want %d: %s", lastAdmin.Code, http.StatusConflict, lastAdmin.Body.String())
	}
	requireUserAPIErrorCode(t, lastAdmin.Body.Bytes(), "last_operational_admin")

	selfDisable := doMuxRequest(t, handler, http.MethodPost, "/api/admin/users/"+created.ID+"/disable", aliceAdminToken, nil)
	if selfDisable.Code != http.StatusConflict {
		t.Fatalf("self disable status = %d, want %d: %s", selfDisable.Code, http.StatusConflict, selfDisable.Body.String())
	}
	requireUserAPIErrorCode(t, selfDisable.Body.Bytes(), "self_user_lifecycle_forbidden")

	selfDelete := doMuxRequest(t, handler, http.MethodDelete, "/api/admin/users/"+created.ID, aliceAdminToken, nil)
	if selfDelete.Code != http.StatusConflict {
		t.Fatalf("self delete status = %d, want %d: %s", selfDelete.Code, http.StatusConflict, selfDelete.Body.String())
	}
	requireUserAPIErrorCode(t, selfDelete.Body.Bytes(), "self_user_lifecycle_forbidden")
}

func TestAPIUserDeleteRequiresDisabledStateAndRevokesSession(t *testing.T) {
	_, handler, adminToken, cleanup := setupTestServerWithStores(t, true)
	defer cleanup()

	create := doMuxRequest(t, handler, http.MethodPost, "/api/admin/users", adminToken, []byte(`{"username":"bob","password":"BobPassword123"}`))
	if create.Code != http.StatusCreated {
		t.Fatalf("create user status = %d, want %d: %s", create.Code, http.StatusCreated, create.Body.String())
	}
	var user userResponse
	if err := json.Unmarshal(create.Body.Bytes(), &user); err != nil {
		t.Fatalf("decode created user: %v", err)
	}
	userToken := loginAdminTokenLocal(t, handler, user.Username, "BobPassword123")

	activeDelete := doMuxRequest(t, handler, http.MethodDelete, "/api/admin/users/"+user.ID, adminToken, nil)
	if activeDelete.Code != http.StatusConflict {
		t.Fatalf("delete active user status = %d, want %d: %s", activeDelete.Code, http.StatusConflict, activeDelete.Body.String())
	}
	requireUserAPIErrorCode(t, activeDelete.Body.Bytes(), "user_must_be_disabled")

	disable := doMuxRequest(t, handler, http.MethodPost, "/api/admin/users/"+user.ID+"/disable", adminToken, nil)
	if disable.Code != http.StatusOK {
		t.Fatalf("disable user status = %d, want %d: %s", disable.Code, http.StatusOK, disable.Body.String())
	}
	var disabled userResponse
	if err := json.Unmarshal(disable.Body.Bytes(), &disabled); err != nil {
		t.Fatalf("decode disabled user: %v", err)
	}
	if disabled.Status != UserStatusDisabled || disabled.Operational {
		t.Fatalf("disabled user = %+v, want non-operational disabled user", disabled)
	}

	revoked := doMuxRequest(t, handler, http.MethodGet, "/api/auth/me", userToken, nil)
	if revoked.Code != http.StatusUnauthorized {
		t.Fatalf("disabled user session status = %d, want %d: %s", revoked.Code, http.StatusUnauthorized, revoked.Body.String())
	}
	requireUserAPIErrorCode(t, revoked.Body.Bytes(), "session_expired_or_revoked")

	deleteUser := doMuxRequest(t, handler, http.MethodDelete, "/api/admin/users/"+user.ID, adminToken, nil)
	if deleteUser.Code != http.StatusNoContent {
		t.Fatalf("delete disabled user status = %d, want %d: %s", deleteUser.Code, http.StatusNoContent, deleteUser.Body.String())
	}
	missing := doMuxRequest(t, handler, http.MethodGet, "/api/admin/users/"+user.ID, adminToken, nil)
	if missing.Code != http.StatusNotFound {
		t.Fatalf("load deleted user status = %d, want %d: %s", missing.Code, http.StatusNotFound, missing.Body.String())
	}
	requireUserAPIErrorCode(t, missing.Body.Bytes(), "user_not_found")
}
