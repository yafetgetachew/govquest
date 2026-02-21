-- GovQuest MVP schema + starter graph data (8 processes)
BEGIN TRANSACTION;

-- Better Auth tables (stored inside SurrealDB)
DEFINE TABLE IF NOT EXISTS user SCHEMALESS;
DEFINE TABLE IF NOT EXISTS session SCHEMALESS;
DEFINE TABLE IF NOT EXISTS account SCHEMALESS;
DEFINE TABLE IF NOT EXISTS verification SCHEMALESS;

DEFINE INDEX IF NOT EXISTS user_email_idx ON user COLUMNS email UNIQUE;
DEFINE INDEX IF NOT EXISTS session_token_idx ON session COLUMNS token UNIQUE;
DEFINE INDEX IF NOT EXISTS account_provider_idx ON account COLUMNS providerId, accountId UNIQUE;

-- Core product nodes
DEFINE TABLE IF NOT EXISTS process SCHEMALESS;
DEFINE TABLE IF NOT EXISTS task SCHEMALESS;
DEFINE TABLE IF NOT EXISTS tip SCHEMALESS;
DEFINE TABLE IF NOT EXISTS feedback SCHEMALESS;

-- Graph edges
DEFINE TABLE IF NOT EXISTS requires TYPE RELATION IN process | task OUT task SCHEMALESS;
DEFINE TABLE IF NOT EXISTS posted TYPE RELATION IN user OUT tip SCHEMALESS;
DEFINE TABLE IF NOT EXISTS voted TYPE RELATION IN user OUT tip SCHEMALESS;
DEFINE INDEX IF NOT EXISTS voted_user_tip_idx ON voted COLUMNS in, out UNIQUE;

-- Helpful field definitions (MVP stays schemaless for flexibility)
DEFINE FIELD IF NOT EXISTS title ON process TYPE string;
DEFINE FIELD IF NOT EXISTS summary ON process TYPE string;
DEFINE FIELD IF NOT EXISTS category ON process TYPE option<string>;

DEFINE FIELD IF NOT EXISTS title ON task TYPE string;
DEFINE FIELD IF NOT EXISTS description ON task TYPE string;

DEFINE FIELD IF NOT EXISTS content ON tip TYPE string;
DEFINE FIELD IF NOT EXISTS upvotes ON tip TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS downvotes ON tip TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS created_at ON tip TYPE datetime VALUE time::now();

DEFINE FIELD IF NOT EXISTS message ON feedback TYPE string;
DEFINE FIELD IF NOT EXISTS user_id ON feedback TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS created_at ON feedback TYPE datetime VALUE time::now();

DEFINE FIELD IF NOT EXISTS task_id ON posted TYPE option<record<task>>;
DEFINE FIELD IF NOT EXISTS created_at ON posted TYPE datetime VALUE time::now();
DEFINE FIELD IF NOT EXISTS direction ON voted TYPE string;
DEFINE FIELD IF NOT EXISTS created_at ON voted TYPE datetime VALUE time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON voted TYPE datetime VALUE time::now();

-- Deterministic reset of MVP seed data
DELETE requires WHERE true;
DELETE posted WHERE true;
DELETE voted WHERE true;
DELETE tip WHERE true;
DELETE feedback WHERE true;
DELETE task WHERE true;
DELETE process WHERE true;

-- ---------------------------------------------------------------------
-- Processes
-- ---------------------------------------------------------------------
CREATE process:passport CONTENT {
  title: "New Ethiopian Passport",
  category: "Identity",
  summary: "Official flow: prepare required identity documents, complete online application and payment, attend biometrics, then collect passport."
};

CREATE process:fayda_registration CONTENT {
  title: "Fayda ID Registration",
  category: "Identity",
  summary: "Register for Ethiopia's legal digital ID (Fayda), complete biometrics, and receive your FIN credential."
};

CREATE process:commercial_registration CONTENT {
  title: "Commercial Registration",
  category: "Business",
  summary: "Register your business entity first, then use the registration output for licensing and tax workflows."
};

CREATE process:trade_license_new CONTENT {
  title: "New Trade License",
  category: "Business",
  summary: "Apply for a new trade license after commercial registration and competency checks."
};

CREATE process:trade_license_renewal CONTENT {
  title: "Trade License Renewal",
  category: "Business",
  summary: "Renew your trade license with annual compliance documents such as audit report and tax clearance."
};

CREATE process:business_visa CONTENT {
  title: "Business Visa Application",
  category: "Immigration",
  summary: "Apply for business entry visa with invitation and business evidence, then track approval and travel timeline."
};

CREATE process:temporary_residence_marriage CONTENT {
  title: "Temporary Residence Permit (Marriage)",
  category: "Immigration",
  summary: "Residence permit flow for foreign spouse of an Ethiopian citizen, including marriage proof and in-person submission."
};

CREATE process:ethiopian_origin_id CONTENT {
  title: "Ethiopian Origin ID (Yellow Card)",
  category: "Immigration",
  summary: "For foreign nationals of Ethiopian origin: prove lineage, submit required documents, and complete in-person processing."
};

-- ---------------------------------------------------------------------
-- Passport tasks
-- Sources: Ethiopian Immigration and Citizenship Service notices/pages
-- ---------------------------------------------------------------------
CREATE task:passport_prepare_docs CONTENT {
  title: "Prepare Required Documents",
  description: "Collect all required identity and civil-status documents before starting online application."
};
CREATE task:passport_birth_certificate CONTENT {
  title: "Birth Certificate",
  description: "Prepare authenticated birth certificate (required for applicants under 40 per ICS guidance)."
};
CREATE task:passport_kebele_id CONTENT {
  title: "Kebele ID or Support Letter",
  description: "Bring renewed Kebele ID. If temporary ID is used, include official support letter from issuing office."
};
CREATE task:passport_fayda_id CONTENT {
  title: "Fayda / National ID Ready",
  description: "Prepare Fayda/National ID credentials where required for online service account verification."
};

CREATE task:passport_online_application CONTENT {
  title: "Complete Online Application",
  description: "Create or log into the passport e-service, complete form details, and confirm appointment slot."
};
CREATE task:passport_fill_form CONTENT {
  title: "Fill Application Form",
  description: "Enter personal details exactly as shown on identity documents."
};
CREATE task:passport_pay_window CONTENT {
  title: "Pay Within Time Window",
  description: "Complete payment within stated time window after application submission."
};
CREATE task:passport_keep_confirmation CONTENT {
  title: "Save Appointment Confirmation",
  description: "Keep your appointment confirmation and payment reference for appointment day."
};

CREATE task:passport_appointment CONTENT {
  title: "Attend Appointment and Biometrics",
  description: "Bring originals and complete fingerprint/photo capture at the assigned office."
};
CREATE task:passport_bring_originals CONTENT {
  title: "Bring Originals + Copies",
  description: "Bring original documents and copies requested in your appointment instructions."
};
CREATE task:passport_biometrics CONTENT {
  title: "Fingerprint and Photo Capture",
  description: "Complete biometric capture and any final verification required by the officer."
};

CREATE task:passport_collection CONTENT {
  title: "Track and Collect Passport",
  description: "Monitor status and collect your passport using the slip/reference issued at submission."
};
CREATE task:passport_track_status CONTENT {
  title: "Track Application Status",
  description: "Track approval/issuance status using official communication channels."
};
CREATE task:passport_collect CONTENT {
  title: "Collect Passport",
  description: "Appear for collection with required reference slip and ID."
};

RELATE process:passport->requires->task:passport_prepare_docs;
RELATE process:passport->requires->task:passport_online_application;
RELATE process:passport->requires->task:passport_appointment;
RELATE process:passport->requires->task:passport_collection;

RELATE task:passport_prepare_docs->requires->task:passport_birth_certificate;
RELATE task:passport_prepare_docs->requires->task:passport_kebele_id;
RELATE task:passport_prepare_docs->requires->task:passport_fayda_id;

RELATE task:passport_online_application->requires->task:passport_fill_form;
RELATE task:passport_online_application->requires->task:passport_pay_window;
RELATE task:passport_online_application->requires->task:passport_keep_confirmation;

RELATE task:passport_appointment->requires->task:passport_bring_originals;
RELATE task:passport_appointment->requires->task:passport_biometrics;

RELATE task:passport_collection->requires->task:passport_track_status;
RELATE task:passport_collection->requires->task:passport_collect;

-- ---------------------------------------------------------------------
-- Fayda registration tasks
-- Source: National ID (Fayda) official pages
-- ---------------------------------------------------------------------
CREATE task:fayda_prepare_evidence CONTENT {
  title: "Prepare Identity and Address Evidence",
  description: "Prepare identity proof and address proof (or witness confirmation where accepted)."
};
CREATE task:fayda_identity_proof CONTENT {
  title: "Identity Proof",
  description: "Use accepted proof (e.g., old Kebele ID, passport, driver license, voter ID, student ID, tax ID, etc.)."
};
CREATE task:fayda_address_proof CONTENT {
  title: "Address Proof or Witness",
  description: "Bring accepted residence evidence (utility/rental/bank/insurance docs) or approved witness route."
};

CREATE task:fayda_choose_center CONTENT {
  title: "Choose Registration Center",
  description: "Select nearby official enrollment center (ethio telecom, banks, post office, or designated center)."
};
CREATE task:fayda_pre_register CONTENT {
  title: "Pre-Register (if offered)",
  description: "Use available pre-registration flow to reduce waiting time at the center."
};
CREATE task:fayda_visit_center CONTENT {
  title: "Visit Selected Center",
  description: "Visit in person with all required evidence and references."
};

CREATE task:fayda_biometrics CONTENT {
  title: "Complete Biometric Enrollment",
  description: "Submit demographic data and biometric capture (photo, fingerprint, and/or iris as requested)."
};
CREATE task:fayda_demographics CONTENT {
  title: "Demographic Data Entry",
  description: "Confirm name, date of birth, and contact details exactly."
};
CREATE task:fayda_bio_capture CONTENT {
  title: "Biometric Capture",
  description: "Complete full biometric capture and verify before final submission."
};

CREATE task:fayda_get_fin CONTENT {
  title: "Receive FIN and Credentials",
  description: "Receive your Fayda Identification Number (FIN) and activate digital credential flow."
};
CREATE task:fayda_fin_sms CONTENT {
  title: "Receive FIN Notification",
  description: "Check SMS/official notification for FIN and enrollment confirmation."
};
CREATE task:fayda_credential CONTENT {
  title: "Activate Credential",
  description: "Download/activate available digital credential or follow up for physical credential options."
};

RELATE process:fayda_registration->requires->task:fayda_prepare_evidence;
RELATE process:fayda_registration->requires->task:fayda_choose_center;
RELATE process:fayda_registration->requires->task:fayda_biometrics;
RELATE process:fayda_registration->requires->task:fayda_get_fin;

RELATE task:fayda_prepare_evidence->requires->task:fayda_identity_proof;
RELATE task:fayda_prepare_evidence->requires->task:fayda_address_proof;

RELATE task:fayda_choose_center->requires->task:fayda_pre_register;
RELATE task:fayda_choose_center->requires->task:fayda_visit_center;

RELATE task:fayda_biometrics->requires->task:fayda_demographics;
RELATE task:fayda_biometrics->requires->task:fayda_bio_capture;

RELATE task:fayda_get_fin->requires->task:fayda_fin_sms;
RELATE task:fayda_get_fin->requires->task:fayda_credential;

-- ---------------------------------------------------------------------
-- Commercial registration tasks
-- Source: MoTRI requirement pages and regulations
-- ---------------------------------------------------------------------
CREATE task:cr_prepare_core_documents CONTENT {
  title: "Prepare Core Documents",
  description: "Prepare TIN, ID, and authorization documents needed for registration."
};
CREATE task:cr_tin CONTENT {
  title: "TIN Certificate",
  description: "Obtain valid TIN certificate before filing commercial registration."
};
CREATE task:cr_id CONTENT {
  title: "Valid ID / Passport",
  description: "Prepare owner/manager identification document."
};
CREATE task:cr_poa CONTENT {
  title: "Power of Attorney (if represented)",
  description: "If an agent files on your behalf, prepare notarized power of attorney and agent ID."
};

CREATE task:cr_prepare_business_evidence CONTENT {
  title: "Prepare Business Evidence",
  description: "Collect legal existence and ownership/authorization documents for the entity."
};
CREATE task:cr_legal_existence CONTENT {
  title: "Legal Existence Certificate",
  description: "Provide legal existence documents where applicable (company/branch structures)."
};
CREATE task:cr_branch_resolution CONTENT {
  title: "Branch Resolution / Shareholder Decision",
  description: "For branches or represented entities, include required board/shareholder authorization."
};
CREATE task:cr_support_letter CONTENT {
  title: "Support Letter (if applicable)",
  description: "Add official support letter when filing route requires it."
};

CREATE task:cr_submit CONTENT {
  title: "Submit Registration",
  description: "Submit application through the designated online government platform and follow correction requests."
};
CREATE task:cr_online_submission CONTENT {
  title: "Online Submission",
  description: "Upload all documents and complete registration form accurately."
};
CREATE task:cr_get_certificate CONTENT {
  title: "Receive Registration Output",
  description: "Download/collect registration certificate and keep it for licensing workflow."
};

RELATE process:commercial_registration->requires->task:cr_prepare_core_documents;
RELATE process:commercial_registration->requires->task:cr_prepare_business_evidence;
RELATE process:commercial_registration->requires->task:cr_submit;

RELATE task:cr_prepare_core_documents->requires->task:cr_tin;
RELATE task:cr_prepare_core_documents->requires->task:cr_id;
RELATE task:cr_prepare_core_documents->requires->task:cr_poa;

RELATE task:cr_prepare_business_evidence->requires->task:cr_legal_existence;
RELATE task:cr_prepare_business_evidence->requires->task:cr_branch_resolution;
RELATE task:cr_prepare_business_evidence->requires->task:cr_support_letter;

RELATE task:cr_submit->requires->task:cr_online_submission;
RELATE task:cr_submit->requires->task:cr_get_certificate;

-- ---------------------------------------------------------------------
-- New trade license tasks
-- Source: MoTRI requirement pages and Trade Licensing Proclamation
-- ---------------------------------------------------------------------
CREATE task:tln_prerequisites CONTENT {
  title: "Confirm Prerequisites",
  description: "A trade license requires commercial registration and competency compliance where applicable."
};
CREATE task:tln_has_registration CONTENT {
  title: "Commercial Registration Completed",
  description: "Confirm valid registration details before licensing."
};
CREATE task:tln_competency CONTENT {
  title: "Competency Certificate",
  description: "Obtain competency proof for regulated business activity categories."
};

CREATE task:tln_application CONTENT {
  title: "Submit New License Application",
  description: "File a new trade license request through official portal with activity details and attachments."
};
CREATE task:tln_activity_selection CONTENT {
  title: "Select Correct Business Activity",
  description: "Choose the exact business activity code/category for your operation."
};
CREATE task:tln_upload_documents CONTENT {
  title: "Upload Required Documents",
  description: "Attach all required files and declarations in correct formats."
};

CREATE task:tln_receive CONTENT {
  title: "Receive and Verify License",
  description: "Collect license output and verify legal name, activity, and validity details."
};
CREATE task:tln_verify CONTENT {
  title: "Verify License Details",
  description: "Verify spelling, activity class, and issue dates before use."
};
CREATE task:tln_archive CONTENT {
  title: "Archive License Copy",
  description: "Store signed copy digitally and physically for inspections and renewals."
};

RELATE process:trade_license_new->requires->task:tln_prerequisites;
RELATE process:trade_license_new->requires->task:tln_application;
RELATE process:trade_license_new->requires->task:tln_receive;

RELATE task:tln_prerequisites->requires->task:tln_has_registration;
RELATE task:tln_prerequisites->requires->task:tln_competency;

RELATE task:tln_application->requires->task:tln_activity_selection;
RELATE task:tln_application->requires->task:tln_upload_documents;

RELATE task:tln_receive->requires->task:tln_verify;
RELATE task:tln_receive->requires->task:tln_archive;

-- ---------------------------------------------------------------------
-- Trade license renewal tasks
-- Source: MoTRI requirement pages
-- ---------------------------------------------------------------------
CREATE task:tlr_prepare CONTENT {
  title: "Prepare Renewal Documents",
  description: "Gather annual compliance documents required before filing renewal."
};
CREATE task:tlr_audit CONTENT {
  title: "Audit Report",
  description: "Prepare latest approved audit report (where required by business type)."
};
CREATE task:tlr_tax_clearance CONTENT {
  title: "Tax Clearance",
  description: "Obtain valid tax clearance certificate for renewal period."
};

CREATE task:tlr_submit CONTENT {
  title: "Submit Renewal Request",
  description: "Submit renewal online before license expiry and complete fee obligations."
};
CREATE task:tlr_before_expiry CONTENT {
  title: "Submit Before Expiry",
  description: "File early to avoid interruption and potential penalties."
};
CREATE task:tlr_fee CONTENT {
  title: "Pay Renewal Fee",
  description: "Pay official renewal fees and keep receipt reference."
};

CREATE task:tlr_receive CONTENT {
  title: "Receive Renewed License",
  description: "Collect renewed license and verify updated validity window."
};
CREATE task:tlr_verify CONTENT {
  title: "Verify Renewal Validity",
  description: "Check renewed period and activity details immediately."
};
CREATE task:tlr_archive CONTENT {
  title: "Archive Renewed Copy",
  description: "Store renewed copy with previous license history."
};

RELATE process:trade_license_renewal->requires->task:tlr_prepare;
RELATE process:trade_license_renewal->requires->task:tlr_submit;
RELATE process:trade_license_renewal->requires->task:tlr_receive;

RELATE task:tlr_prepare->requires->task:tlr_audit;
RELATE task:tlr_prepare->requires->task:tlr_tax_clearance;

RELATE task:tlr_submit->requires->task:tlr_before_expiry;
RELATE task:tlr_submit->requires->task:tlr_fee;

RELATE task:tlr_receive->requires->task:tlr_verify;
RELATE task:tlr_receive->requires->task:tlr_archive;

-- ---------------------------------------------------------------------
-- Business visa tasks
-- Source: Ethiopian Immigration and Citizenship Service business visa page
-- ---------------------------------------------------------------------
CREATE task:bv_prepare_documents CONTENT {
  title: "Prepare Visa Documents",
  description: "Collect passport, photos, invitation letter, and business proof documents."
};
CREATE task:bv_passport CONTENT {
  title: "Valid Passport",
  description: "Passport must be valid for at least six months from intended entry date."
};
CREATE task:bv_photos CONTENT {
  title: "Passport Photos",
  description: "Prepare recent passport-size photos matching visa photo requirements."
};
CREATE task:bv_invitation CONTENT {
  title: "Invitation and Business Letter",
  description: "Prepare invitation letter from Ethiopian host and supporting business letter/documents."
};

CREATE task:bv_submit CONTENT {
  title: "Submit Visa Application",
  description: "Complete application form, upload documents, and pay required fee."
};
CREATE task:bv_form CONTENT {
  title: "Complete Application Form",
  description: "Fill visa form with matching personal/passport details."
};
CREATE task:bv_fee CONTENT {
  title: "Pay Visa Fee",
  description: "Pay official fee through accepted channels and keep receipt."
};

CREATE task:bv_followup CONTENT {
  title: "Track Decision",
  description: "Monitor processing status and provide additional documents if requested."
};
CREATE task:bv_track CONTENT {
  title: "Track Processing",
  description: "Track status in official portal/communications until approval."
};
CREATE task:bv_additional CONTENT {
  title: "Respond to Additional Requests",
  description: "If asked, submit additional files before deadline."
};

RELATE process:business_visa->requires->task:bv_prepare_documents;
RELATE process:business_visa->requires->task:bv_submit;
RELATE process:business_visa->requires->task:bv_followup;

RELATE task:bv_prepare_documents->requires->task:bv_passport;
RELATE task:bv_prepare_documents->requires->task:bv_photos;
RELATE task:bv_prepare_documents->requires->task:bv_invitation;

RELATE task:bv_submit->requires->task:bv_form;
RELATE task:bv_submit->requires->task:bv_fee;

RELATE task:bv_followup->requires->task:bv_track;
RELATE task:bv_followup->requires->task:bv_additional;

-- ---------------------------------------------------------------------
-- Temporary residence permit by marriage tasks
-- Source: Ethiopian Immigration and Citizenship Service residence permit page
-- ---------------------------------------------------------------------
CREATE task:trm_prepare_passport_visa CONTENT {
  title: "Prepare Passport and Visa Records",
  description: "Prepare passport and visa copies required for residence permit filing."
};
CREATE task:trm_passport_validity CONTENT {
  title: "Passport Validity (6+ months)",
  description: "Passport must have at least six months remaining validity."
};
CREATE task:trm_visa_stamp_copy CONTENT {
  title: "Visa + Entry Stamp Copy",
  description: "Prepare clear copy of current visa and latest entry stamp page."
};
CREATE task:trm_extended_visa_copy CONTENT {
  title: "Last Extended Visa (if any)",
  description: "If previously extended, include the latest extension visa copy."
};

CREATE task:trm_prepare_marriage_documents CONTENT {
  title: "Prepare Marriage Documents",
  description: "Prepare marriage certificate and spouse identity evidence."
};
CREATE task:trm_marriage_certificate CONTENT {
  title: "Authenticated Marriage Certificate",
  description: "Prepare properly authenticated marriage certificate."
};
CREATE task:trm_translation CONTENT {
  title: "Translation (if needed)",
  description: "If certificate is not in English/Amharic as required, prepare official translation."
};
CREATE task:trm_spouse_id CONTENT {
  title: "Spouse ID / Passport",
  description: "Prepare Ethiopian spouse Kebele ID or passport copy."
};

CREATE task:trm_submit CONTENT {
  title: "Submit Residence Application",
  description: "Submit completed form with photos and required in-person attendance."
};
CREATE task:trm_form CONTENT {
  title: "Completed Application Form",
  description: "Complete residence permit form accurately and sign where required."
};
CREATE task:trm_photos CONTENT {
  title: "Recent Photos",
  description: "Prepare required passport-size photos for file."
};
CREATE task:trm_spouse_presence CONTENT {
  title: "Spouse In-Person Presence",
  description: "Ensure Ethiopian spouse appears with applicant when required."
};

CREATE task:trm_renewal CONTENT {
  title: "Track Expiry and Renewal",
  description: "Track permit validity and renew before expiration."
};
CREATE task:trm_expiry_monitor CONTENT {
  title: "Monitor Expiry Date",
  description: "Set reminders for permit expiration timeline."
};
CREATE task:trm_renew_before_expiry CONTENT {
  title: "Renew Before Deadline",
  description: "Start renewal process ahead of deadline to avoid status issues."
};

RELATE process:temporary_residence_marriage->requires->task:trm_prepare_passport_visa;
RELATE process:temporary_residence_marriage->requires->task:trm_prepare_marriage_documents;
RELATE process:temporary_residence_marriage->requires->task:trm_submit;
RELATE process:temporary_residence_marriage->requires->task:trm_renewal;

RELATE task:trm_prepare_passport_visa->requires->task:trm_passport_validity;
RELATE task:trm_prepare_passport_visa->requires->task:trm_visa_stamp_copy;
RELATE task:trm_prepare_passport_visa->requires->task:trm_extended_visa_copy;

RELATE task:trm_prepare_marriage_documents->requires->task:trm_marriage_certificate;
RELATE task:trm_prepare_marriage_documents->requires->task:trm_translation;
RELATE task:trm_prepare_marriage_documents->requires->task:trm_spouse_id;

RELATE task:trm_submit->requires->task:trm_form;
RELATE task:trm_submit->requires->task:trm_photos;
RELATE task:trm_submit->requires->task:trm_spouse_presence;

RELATE task:trm_renewal->requires->task:trm_expiry_monitor;
RELATE task:trm_renewal->requires->task:trm_renew_before_expiry;

-- ---------------------------------------------------------------------
-- Ethiopian Origin ID tasks
-- Source: Ethiopian Immigration and Citizenship Service origin ID page
-- ---------------------------------------------------------------------
CREATE task:eoid_prepare_core CONTENT {
  title: "Prepare Core Application Documents",
  description: "Prepare form, passport, visa, and entry-stamp related requirements."
};
CREATE task:eoid_form CONTENT {
  title: "Application Form",
  description: "Complete Ethiopian Origin ID application form."
};
CREATE task:eoid_passport CONTENT {
  title: "Passport Validity (6+ months)",
  description: "Prepare valid passport with minimum six months validity."
};
CREATE task:eoid_visa_and_stamp CONTENT {
  title: "Visa + Last Entry Stamp",
  description: "Prepare current visa and latest entry stamp copies."
};
CREATE task:eoid_extended_visa CONTENT {
  title: "Last Extended Visa (if any)",
  description: "If previously extended, include latest extension record."
};

CREATE task:eoid_prove_origin CONTENT {
  title: "Prepare Origin Proof",
  description: "Provide proof of Ethiopian lineage and parent identity documents."
};
CREATE task:eoid_old_passport_or_birth CONTENT {
  title: "Old Ethiopian Passport or Birth Certificate",
  description: "Provide old machine-readable Ethiopian passport or authenticated birth certificate."
};
CREATE task:eoid_parent_id CONTENT {
  title: "Parent Kebele ID or Passport",
  description: "Provide parent Kebele ID/passport copy as supporting lineage proof."
};
CREATE task:eoid_previous_kebele_if_foreign CONTENT {
  title: "Previous Kebele ID (if applicable)",
  description: "If applicant is now a foreign citizen, include previous Ethiopian Kebele ID evidence where available."
};

CREATE task:eoid_special_cases CONTENT {
  title: "Special Case Documents",
  description: "Prepare additional legal documents for under-18, name-change, or document-gap cases."
};
CREATE task:eoid_under18_adoption CONTENT {
  title: "Under-18 Adoption Documents",
  description: "If applicant is under 18, include parent/guardian and adoption court documents where required."
};
CREATE task:eoid_name_change CONTENT {
  title: "Name-Change Court Decision",
  description: "If applicant name differs from parent records, include court decision and gazette publication evidence."
};
CREATE task:eoid_document_gap CONTENT {
  title: "Document-Gap Evidence",
  description: "When primary lineage documents are missing, include alternate evidence such as death certificate, as requested."
};

CREATE task:eoid_submit CONTENT {
  title: "Submit and Follow Up",
  description: "Submit in person (no proxy), track issuance, and monitor renewal timeline."
};
CREATE task:eoid_photo CONTENT {
  title: "Recent Photo",
  description: "Provide one recent passport-size photo as required."
};
CREATE task:eoid_in_person CONTENT {
  title: "In-Person Submission (No Proxy)",
  description: "Applicant must appear in person; proxy processing is not accepted."
};
CREATE task:eoid_track CONTENT {
  title: "Track Issuance and Renewal",
  description: "Track processing updates and plan renewal before card expiration."
};

RELATE process:ethiopian_origin_id->requires->task:eoid_prepare_core;
RELATE process:ethiopian_origin_id->requires->task:eoid_prove_origin;
RELATE process:ethiopian_origin_id->requires->task:eoid_special_cases;
RELATE process:ethiopian_origin_id->requires->task:eoid_submit;

RELATE task:eoid_prepare_core->requires->task:eoid_form;
RELATE task:eoid_prepare_core->requires->task:eoid_passport;
RELATE task:eoid_prepare_core->requires->task:eoid_visa_and_stamp;
RELATE task:eoid_prepare_core->requires->task:eoid_extended_visa;

RELATE task:eoid_prove_origin->requires->task:eoid_old_passport_or_birth;
RELATE task:eoid_prove_origin->requires->task:eoid_parent_id;
RELATE task:eoid_prove_origin->requires->task:eoid_previous_kebele_if_foreign;

RELATE task:eoid_special_cases->requires->task:eoid_under18_adoption;
RELATE task:eoid_special_cases->requires->task:eoid_name_change;
RELATE task:eoid_special_cases->requires->task:eoid_document_gap;

RELATE task:eoid_submit->requires->task:eoid_photo;
RELATE task:eoid_submit->requires->task:eoid_in_person;
RELATE task:eoid_submit->requires->task:eoid_track;

COMMIT TRANSACTION;
