CREATE TYPE "public"."rbac_event_type" AS ENUM('user_invited', 'user_activated', 'user_deactivated', 'role_granted', 'role_revoked', 'party_scope_granted', 'party_scope_revoked', 'sensitive_action_denied', 'authentication_failed', 'session_revoked', 'password_recovery_requested', 'administrator_invariant_blocked');--> statement-breakpoint
CREATE TYPE "public"."rbac_executor_type" AS ENUM('user', 'system', 'background_job');--> statement-breakpoint
CREATE TYPE "public"."scope_kind" AS ENUM('global', 'assigned_party');--> statement-breakpoint
CREATE TYPE "public"."user_profile_status" AS ENUM('invited', 'active', 'inactive');--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource" varchar(100) NOT NULL,
	"action" varchar(100) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_resource_action_unique" UNIQUE("resource","action")
);
--> statement-breakpoint
CREATE TABLE "rbac_security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "rbac_event_type" NOT NULL,
	"actor_user_id" uuid,
	"executor_type" "rbac_executor_type" NOT NULL,
	"executor_id" text,
	"target_type" text NOT NULL,
	"target_id" text,
	"reason" text,
	"details" jsonb,
	"correlation_id" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"scope_kind" "scope_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_scope_kind_pk" PRIMARY KEY("role_id","permission_id","scope_kind")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "user_party_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"flow_type" "flow_type",
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" uuid,
	"grant_reason" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"revocation_reason" text
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"status" "user_profile_status" DEFAULT 'invited' NOT NULL,
	"activated_at" timestamp with time zone,
	"activated_by_user_id" uuid,
	"deactivated_at" timestamp with time zone,
	"deactivated_by_user_id" uuid,
	"deactivation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" uuid,
	"grant_reason" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"revocation_reason" text
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_party_scopes" ADD CONSTRAINT "user_party_scopes_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_party_scopes" ADD CONSTRAINT "user_party_scopes_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_activated_by_user_id_user_profiles_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rbac_security_events_actor_idx" ON "rbac_security_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "rbac_security_events_target_idx" ON "rbac_security_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "rbac_security_events_correlation_idx" ON "rbac_security_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_party_scopes_active_unique" ON "user_party_scopes" USING btree ("user_id","party_id","flow_type") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "user_party_scopes_user_idx" ON "user_party_scopes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_party_scopes_party_idx" ON "user_party_scopes" USING btree ("party_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_active_unique" ON "user_roles" USING btree ("user_id","role_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id");