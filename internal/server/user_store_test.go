package server

import (
	"errors"
	"testing"
)

func TestAdminStoreUserLifecycleContract(t *testing.T) {
	store := newInitializedAdminStore(t)
	admin, err := store.GetSingleAdminUser()
	if err != nil {
		t.Fatalf("load initialized administrator: %v", err)
	}

	user, err := store.CreateUser("alice", "Alice1234")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if user.ID == "" || user.Username != "alice" || user.IsAdmin || user.Status != UserStatusActive || user.Role != "user" {
		t.Fatalf("created user = %+v, want active non-administrator alice", user)
	}
	if _, err := store.CreateUser("alice", "Alice1234"); !errors.Is(err, ErrUserAlreadyExists) {
		t.Fatalf("duplicate user error = %v, want ErrUserAlreadyExists", err)
	}

	userSession := mustCreateSession(t, store, user.ID, user.Username, user.Role, "127.0.0.1", "user-agent")
	promoted, changed, err := store.SetUserAdmin(admin.ID, user.ID, true)
	if err != nil {
		t.Fatalf("promote user: %v", err)
	}
	if !changed || !promoted.IsAdmin || promoted.Role != "admin" {
		t.Fatalf("promote result = (%+v, %v), want changed administrator", promoted, changed)
	}
	if store.GetSession(userSession.ID) != nil {
		t.Fatal("administrator promotion must revoke the target user's web session")
	}

	adminSession := mustCreateSession(t, store, user.ID, user.Username, "admin", "127.0.0.1", "user-agent")
	demoted, changed, err := store.SetUserAdmin(admin.ID, user.ID, false)
	if err != nil {
		t.Fatalf("demote user: %v", err)
	}
	if !changed || demoted.IsAdmin || demoted.Role != "user" {
		t.Fatalf("demote result = (%+v, %v), want changed non-administrator", demoted, changed)
	}
	if store.GetSession(adminSession.ID) != nil {
		t.Fatal("administrator demotion must revoke the target user's web session")
	}

	if _, _, err := store.SetUserAdmin(admin.ID, admin.ID, false); !errors.Is(err, ErrLastOperationalAdmin) {
		t.Fatalf("demote final active administrator error = %v, want ErrLastOperationalAdmin", err)
	}
	if _, _, err := store.SetUserStatus(admin.ID, admin.ID, UserStatusDisabled); !errors.Is(err, ErrSelfUserLifecycleMutation) {
		t.Fatalf("self disable error = %v, want ErrSelfUserLifecycleMutation", err)
	}

	userSession = mustCreateSession(t, store, user.ID, user.Username, user.Role, "127.0.0.1", "user-agent")
	disabled, changed, err := store.SetUserStatus(admin.ID, user.ID, UserStatusDisabled)
	if err != nil {
		t.Fatalf("disable user: %v", err)
	}
	if !changed || disabled.Status != UserStatusDisabled {
		t.Fatalf("disable result = (%+v, %v), want changed disabled user", disabled, changed)
	}
	if store.GetSession(userSession.ID) != nil {
		t.Fatal("disabling a user must revoke the target user's web session")
	}
	if _, err := store.ValidateUserPassword(user.Username, "Alice1234"); !errors.Is(err, ErrUserDisabled) {
		t.Fatalf("disabled user password validation error = %v, want ErrUserDisabled", err)
	}
	if _, changed, err := store.SetUserStatus(admin.ID, user.ID, UserStatusDisabled); err != nil || changed {
		t.Fatalf("idempotent disable = (_, %v, %v), want (_, false, nil)", changed, err)
	}

	if err := store.DeleteDisabledUser(admin.ID, user.ID); err != nil {
		t.Fatalf("delete disabled user: %v", err)
	}
	if _, err := store.GetUser(user.ID); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("load deleted user error = %v, want ErrUserNotFound", err)
	}
}

func TestAdminStoreUserListPaginationAndLiteralQuery(t *testing.T) {
	store := newInitializedAdminStore(t)
	for _, username := range []string{"literal%name", "literalXname", "zoe"} {
		if _, err := store.CreateUser(username, "Password123"); err != nil {
			t.Fatalf("create %q: %v", username, err)
		}
	}

	first, err := store.ListUsers(UserListOptions{Limit: 1})
	if err != nil {
		t.Fatalf("list first user page: %v", err)
	}
	if len(first.Items) != 1 || !first.HasMore || first.NextCursor == "" {
		t.Fatalf("first page = %+v, want one item and a next cursor", first)
	}
	second, err := store.ListUsers(UserListOptions{Limit: 1, Cursor: first.NextCursor})
	if err != nil {
		t.Fatalf("list second user page: %v", err)
	}
	if len(second.Items) != 1 || second.Items[0].ID == first.Items[0].ID {
		t.Fatalf("second page = %+v, want a different item", second)
	}
	if _, err := store.ListUsers(UserListOptions{Cursor: "not-a-cursor"}); err == nil {
		t.Fatal("malformed cursor should be rejected")
	}

	matched, err := store.ListUsers(UserListOptions{Query: "literal%"})
	if err != nil {
		t.Fatalf("literal query: %v", err)
	}
	if len(matched.Items) != 1 || matched.Items[0].Username != "literal%name" {
		t.Fatalf("literal query items = %+v, want only literal%%name", matched.Items)
	}
}

func TestAdminStoreUserManagementActivitiesAreScopedAndAtomic(t *testing.T) {
	store := newInitializedAdminStore(t)
	admin, err := store.GetSingleAdminUser()
	if err != nil {
		t.Fatalf("load administrator: %v", err)
	}
	actor := ActivityActor{Type: "admin", ID: admin.ID, Name: admin.Username}

	assertActivity := func(activityID int64, target User, action string) {
		t.Helper()
		if activityID <= 0 {
			t.Fatalf("%s activity ID = %d, want positive", action, activityID)
		}
		item, err := store.activityStore.GetByID(activityID)
		if err != nil {
			t.Fatalf("load %s activity: %v", action, err)
		}
		if item.Action != action || item.ScopeUserID != target.ID || item.SubjectUserID != target.ID {
			t.Fatalf("%s activity = %+v, want target scope/subject %q", action, item, target.ID)
		}
		if item.Actor.Type != "admin" || item.Actor.ID != admin.ID {
			t.Fatalf("%s actor = %+v, want administrator %q", action, item.Actor, admin.ID)
		}
	}

	target, activityID, err := store.CreateUserWithActivity("activity-user", "Password123", actor)
	if err != nil {
		t.Fatalf("create user with activity: %v", err)
	}
	assertActivity(activityID, target, "user_created")

	target, activityID, err = store.UpdateUserUsernameWithActivity(target.ID, "activity-user-renamed", actor)
	if err != nil {
		t.Fatalf("rename user with activity: %v", err)
	}
	assertActivity(activityID, target, "user_username_changed")

	target, activityID, err = store.ResetUserPasswordWithActivity(target.ID, "ResetPassword123", actor)
	if err != nil {
		t.Fatalf("reset password with activity: %v", err)
	}
	assertActivity(activityID, target, "user_password_reset")

	target, changed, activityID, err := store.SetUserAdminWithActivity(admin.ID, target.ID, true, actor)
	if err != nil || !changed {
		t.Fatalf("promote with activity = (%+v, %v, %d, %v)", target, changed, activityID, err)
	}
	assertActivity(activityID, target, "user_admin_granted")

	target, changed, activityID, err = store.SetUserAdminWithActivity(admin.ID, target.ID, false, actor)
	if err != nil || !changed {
		t.Fatalf("demote with activity = (%+v, %v, %d, %v)", target, changed, activityID, err)
	}
	assertActivity(activityID, target, "user_admin_revoked")

	target, changed, activityID, err = store.SetUserStatusWithActivity(admin.ID, target.ID, UserStatusDisabled, actor)
	if err != nil || !changed {
		t.Fatalf("disable with activity = (%+v, %v, %d, %v)", target, changed, activityID, err)
	}
	assertActivity(activityID, target, "user_disabled")

	target, changed, activityID, err = store.SetUserStatusWithActivity(admin.ID, target.ID, UserStatusActive, actor)
	if err != nil || !changed {
		t.Fatalf("enable with activity = (%+v, %v, %d, %v)", target, changed, activityID, err)
	}
	assertActivity(activityID, target, "user_enabled")

	_ = mustCreateSession(t, store, target.ID, target.Username, target.Role, "127.0.0.1", "user-agent")
	activityID, err = store.DeleteSessionsByUserIDWithActivity(target.ID, actor)
	if err != nil {
		t.Fatalf("revoke sessions with activity: %v", err)
	}
	assertActivity(activityID, target, "user_sessions_revoked")

	store.activityStore.failNextAppendsForTest(errors.New("injected activity failure"), 1)
	if _, _, err := store.CreateUserWithActivity("rolled-back-user", "Password123", actor); err == nil {
		t.Fatal("create user should roll back when activity append fails")
	}
	if _, err := store.GetUserByUsername("rolled-back-user"); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("rolled-back user lookup error = %v, want ErrUserNotFound", err)
	}
}
