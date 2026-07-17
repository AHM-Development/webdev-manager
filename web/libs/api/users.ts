import type {
  InviteRegistrationValues,
  ProfileValues,
} from "@/components/users/user-form-schemas";

import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  phoneE164: string | null;
  phoneCountry: string | null;
  discordId: string | null;
  discordVerifiedAt: string | null;
  dateOfBirth: string | null;
  gender: "male" | "female" | null;
  avatarUrl: string | null;
  role: "superadmin" | "developer" | "staff";
  title:
    | "client_success_manager"
    | "designer"
    | "seo"
    | "operations"
    | null;
  status: "active" | "invited" | "disabled";
  invitedAt: string | null;
  inviteAcceptedAt: string | null;
  passwordUpdatedAt: string;
  lastLoginAt: string | null;
  createdAt: string;
};

export type InviteDetail = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: ApiUser["role"];
  expiresAt: string;
};

export async function listUsers(params?: {
  q?: string;
  role?: ApiUser["role"] | "all";
  status?: ApiUser["status"] | "all";
}) {
  const { data } = await apiClient.get<{ users: ApiUser[] }>(
    endpoints.users.list,
    { params }
  );
  return data.users;
}

export async function createUserInvite(payload: {
  firstName: string;
  lastName: string;
  email: string;
  role: ApiUser["role"];
  title?: ApiUser["title"];
}) {
  const { data } = await apiClient.post<{
    user: ApiUser;
    invite: {
      id: string;
      inviteUrl: string;
      expiresAt: string;
      delivered: boolean;
    };
  }>(endpoints.users.invite, payload);
  return data;
}

export async function updateUser(
  userId: string,
  payload: {
    firstName: string;
    lastName: string;
    email: string;
    role: ApiUser["role"];
    title?: ApiUser["title"];
    status: ApiUser["status"];
  }
) {
  const { data } = await apiClient.patch<{ user: ApiUser }>(
    endpoints.users.update(userId),
    payload
  );
  return data.user;
}

export async function sendUserResetLink(userId: string) {
  const { data } = await apiClient.post<{ delivered: boolean }>(
    endpoints.users.resetLink(userId)
  );
  return data.delivered;
}

export async function deleteUser(userId: string) {
  await apiClient.delete(endpoints.users.delete(userId));
}

export async function getInvite(token: string) {
  const { data } = await apiClient.get<{ invite: InviteDetail }>(
    endpoints.invites.detail(token)
  );
  return data.invite;
}

export async function acceptInvite(
  token: string,
  payload: InviteRegistrationValues
) {
  const { data } = await apiClient.post<{ user: ApiUser }>(
    endpoints.invites.accept(token),
    payload
  );
  return data.user;
}

export async function getProfile() {
  const { data } = await apiClient.get<{ user: ApiUser }>(endpoints.profile.me);
  return data.user;
}

export async function updateProfile(payload: ProfileValues) {
  const { data } = await apiClient.patch<{ user: ApiUser }>(
    endpoints.profile.update,
    payload
  );
  return data.user;
}

export async function requestProfilePasswordOtp() {
  const { data } = await apiClient.post<{
    otp: { delivered: boolean; expiresAt: string };
  }>(endpoints.profile.passwordOtp);
  return data.otp;
}

export async function changeProfilePassword(payload: {
  otp: string;
  newPassword: string;
  confirmPassword: string;
}) {
  await apiClient.post(endpoints.profile.password, payload);
}

export async function testDiscordUser(discordId: string) {
  const { data } = await apiClient.post<{
    discordId: string;
    valid: boolean;
    connected: boolean;
    message: string;
  }>(endpoints.integrations.discordTestUser, { discordId });
  return data;
}
