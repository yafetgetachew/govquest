-- GovQuest MVP schema + starter graph data (32 processes)
BEGIN TRANSACTION;

-- Better Auth tables (stored inside SurrealDB)
DEFINE TABLE IF NOT EXISTS user SCHEMALESS;
DEFINE TABLE IF NOT EXISTS session SCHEMALESS;
DEFINE TABLE IF NOT EXISTS account SCHEMALESS;
DEFINE TABLE IF NOT EXISTS verification SCHEMALESS;
DEFINE TABLE IF NOT EXISTS rateLimit SCHEMALESS;

DEFINE INDEX IF NOT EXISTS user_email_idx ON user COLUMNS email UNIQUE;
DEFINE INDEX IF NOT EXISTS session_token_idx ON session COLUMNS token UNIQUE;
DEFINE INDEX IF NOT EXISTS account_provider_idx ON account COLUMNS providerId, accountId UNIQUE;
DEFINE INDEX IF NOT EXISTS rate_limit_key_idx ON rateLimit COLUMNS key UNIQUE;

-- Core product nodes
DEFINE TABLE IF NOT EXISTS process SCHEMALESS;
DEFINE TABLE IF NOT EXISTS task SCHEMALESS;
DEFINE TABLE IF NOT EXISTS tip SCHEMALESS;
DEFINE TABLE IF NOT EXISTS feedback SCHEMALESS;

-- Graph edges
DEFINE TABLE IF NOT EXISTS requires TYPE RELATION IN process | task OUT task SCHEMALESS;
DEFINE TABLE IF NOT EXISTS posted TYPE RELATION IN user OUT tip SCHEMALESS;
DEFINE TABLE IF NOT EXISTS voted TYPE RELATION IN user OUT tip SCHEMALESS;
DEFINE TABLE IF NOT EXISTS started TYPE RELATION IN user OUT process SCHEMALESS;

-- Deterministic reset of MVP seed data
-- Run cleanup before strict field/index definitions so import is resilient on dirty local data.
DELETE requires WHERE true;
DELETE posted WHERE true;
DELETE voted WHERE true;
DELETE started WHERE true;
DELETE tip WHERE true;
DELETE feedback WHERE true;
DELETE task WHERE true;
DELETE process WHERE true;

DEFINE INDEX IF NOT EXISTS voted_user_tip_idx ON voted COLUMNS in, out UNIQUE;
DEFINE INDEX IF NOT EXISTS started_user_process_idx ON started COLUMNS in, out UNIQUE;
DEFINE INDEX IF NOT EXISTS voted_tip_direction_idx ON voted COLUMNS out, direction;
DEFINE INDEX IF NOT EXISTS posted_task_idx ON posted COLUMNS task_id;
DEFINE INDEX IF NOT EXISTS requires_in_sort_order_idx ON requires COLUMNS in, sort_order;

-- Helpful field definitions (MVP stays schemaless for flexibility)
DEFINE FIELD IF NOT EXISTS title ON process TYPE string;
DEFINE FIELD IF NOT EXISTS summary ON process TYPE string;
DEFINE FIELD IF NOT EXISTS explanation ON process TYPE option<string>;
DEFINE FIELD IF NOT EXISTS output ON process TYPE option<string>;
DEFINE FIELD IF NOT EXISTS category ON process TYPE option<string>;
DEFINE FIELD IF NOT EXISTS location ON process TYPE option<string>;
DEFINE FIELD IF NOT EXISTS links ON process TYPE option<array<object>>;
DEFINE FIELD IF NOT EXISTS attendance_modes ON process TYPE option<array<string>>;

DEFINE FIELD IF NOT EXISTS title ON task TYPE string;
DEFINE FIELD IF NOT EXISTS description ON task TYPE string;
DEFINE FIELD IF NOT EXISTS location ON task TYPE option<string>;
DEFINE FIELD IF NOT EXISTS links ON task TYPE option<array<object>>;
DEFINE FIELD IF NOT EXISTS required_documents ON task TYPE option<array<object>>;
DEFINE FIELD IF NOT EXISTS required_documents_mode ON task TYPE option<string>;

DEFINE FIELD IF NOT EXISTS content ON tip TYPE string;
DEFINE FIELD IF NOT EXISTS upvotes ON tip TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS downvotes ON tip TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS created_at ON tip TYPE datetime DEFAULT time::now();

DEFINE FIELD IF NOT EXISTS message ON feedback TYPE string;
DEFINE FIELD IF NOT EXISTS user_id ON feedback TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS created_at ON feedback TYPE datetime DEFAULT time::now();

DEFINE FIELD IF NOT EXISTS task_id ON posted TYPE option<record<task>>;
DEFINE FIELD IF NOT EXISTS created_at ON posted TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS direction ON voted TYPE string;
DEFINE FIELD IF NOT EXISTS created_at ON voted TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON voted TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS created_at ON started TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS active ON started TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS manual_task_state ON started TYPE object;
DEFINE FIELD IF NOT EXISTS progress_percent ON started TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS resolved_count ON started TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS completed_count ON started TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_count ON started TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS completion_points ON started TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS completed ON started TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS completed_at ON started TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS updated_at ON started TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS sort_order ON requires TYPE option<int>;
DEFINE FIELD IF NOT EXISTS key ON rateLimit TYPE string;
DEFINE FIELD IF NOT EXISTS count ON rateLimit TYPE number;
DEFINE FIELD IF NOT EXISTS lastRequest ON rateLimit TYPE number;

-- ---------------------------------------------------------------------
-- Processes
-- ---------------------------------------------------------------------
CREATE process:passport CONTENT {
  title: "New Ethiopian Passport",
  category: "Identity",
  summary: "Official flow: prepare required identity documents, complete online application and payment, attend biometrics, then collect passport.",
  explanation: "A passport is Ethiopia's official international travel document. This process covers first-time issuance, document checks, online submission, biometrics, and collection through the immigration authority.",
  output: "A valid Ethiopian passport booklet.",
  location: "Ethiopian Immigration and Citizenship Service branch assigned in your appointment",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "ICS Portal", url: "https://www.ics.gov.et" },
    { label: "ICS Services", url: "https://www.ics.gov.et/service" }
  ]
};

CREATE process:fayda_registration CONTENT {
  title: "Fayda ID Registration",
  category: "Identity",
  summary: "Register for Ethiopia's legal digital ID (Fayda), complete biometrics, and receive your FIN credential.",
  explanation: "Fayda is Ethiopia's foundational digital ID system used to verify identity across public and private services. The process registers your identity, captures biometrics, and links you to a unique FIN.",
  output: "FIN (Fayda Identification Number) and digital ID credential.",
  location: "Fayda registration centers (Ethio telecom, selected banks, post offices, and approved enrollment centers)",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "National ID (Fayda)", url: "https://id.gov.et" },
    { label: "Find Registration Center", url: "https://id.gov.et/service-locations" }
  ]
};

CREATE process:commercial_registration CONTENT {
  title: "Commercial Registration",
  category: "Business",
  summary: "Register your business entity first, then use the registration output for licensing and tax workflows.",
  explanation: "Commercial registration is the legal entry point for doing formal business in Ethiopia. It establishes your business record, which is later required for licensing, taxation, and compliance.",
  output: "Commercial registration certificate/record for the business entity.",
  location: "Online via eTrade and at MoTRI/regional trade offices where needed",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "MoTRI", url: "https://www.motri.gov.et" },
    { label: "eTrade Portal", url: "https://etrade.gov.et" }
  ]
};

CREATE process:trade_license_new CONTENT {
  title: "New Trade License",
  category: "Business",
  summary: "Apply for a new trade license after commercial registration and competency checks.",
  explanation: "A trade license authorizes a business to operate in a specific commercial activity category. This process verifies registration, competency, and activity classification before issuance.",
  output: "Valid trade license for the selected business activity.",
  location: "Online via eTrade and trade offices assigned by your region/city",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "eTrade Portal", url: "https://etrade.gov.et" }
  ]
};

CREATE process:trade_license_renewal CONTENT {
  title: "Trade License Renewal",
  category: "Business",
  summary: "Renew your trade license with annual compliance documents such as audit report and tax clearance.",
  explanation: "Trade licenses are time-bound and require renewal with updated compliance documents. This process keeps your business legally active without interruption.",
  output: "Renewed trade license with updated validity period.",
  location: "Online via eTrade and trade offices assigned by your region/city",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "eTrade Portal", url: "https://etrade.gov.et" }
  ]
};

CREATE process:business_visa CONTENT {
  title: "Business Visa Application",
  category: "Immigration",
  summary: "Apply for business entry visa with invitation and business evidence, then track approval and travel timeline.",
  explanation: "A business visa permits short-term entry into Ethiopia for commercial meetings, negotiations, and related business activities. Approval depends on invitation and supporting records.",
  output: "Approved business visa or formal decision status.",
  location: "Online and Ethiopian Immigration/mission channels based on applicant route",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "ICS Portal", url: "https://www.ics.gov.et" },
    { label: "ICS Services", url: "https://www.ics.gov.et/service" }
  ]
};

CREATE process:temporary_residence_marriage CONTENT {
  title: "Temporary Residence Permit (Marriage)",
  category: "Immigration",
  summary: "Residence permit flow for foreign spouse of an Ethiopian citizen, including marriage proof and in-person submission.",
  explanation: "This permit allows a foreign spouse of an Ethiopian citizen to stay legally in Ethiopia beyond short-term visa limits, based on documented marital relationship and immigration checks.",
  output: "Temporary residence permit linked to marriage-based eligibility.",
  location: "Ethiopian Immigration and Citizenship Service offices handling residence services",
  attendance_modes: ["in_person"],
  links: [
    { label: "ICS Portal", url: "https://www.ics.gov.et" },
    { label: "Residence Services", url: "https://www.ics.gov.et/service" }
  ]
};

CREATE process:ethiopian_origin_id CONTENT {
  title: "Ethiopian Origin ID (Yellow Card)",
  category: "Immigration",
  summary: "For foreign nationals of Ethiopian origin: prove lineage, submit required documents, and complete in-person processing.",
  explanation: "The Ethiopian Origin ID (Yellow Card) is issued to foreign nationals of Ethiopian origin and grants designated rights and service access under Ethiopian law.",
  output: "Issued Ethiopian Origin ID (Yellow Card).",
  location: "Ethiopian Immigration and Citizenship Service offices handling origin ID applications",
  attendance_modes: ["in_person"],
  links: [
    { label: "ICS Portal", url: "https://www.ics.gov.et" },
    { label: "Origin ID Services", url: "https://www.ics.gov.et/service" }
  ]
};

CREATE process:kebele_id_residency CONTENT {
  title: "Kebele ID Issuance / Renewal",
  category: "Identity",
  summary: "Issue, replace, or renew Kebele/residency ID through the local district service office.",
  explanation: "A Kebele ID is the primary local residency and civil identity document used for many day-to-day public services in Ethiopia. It is often requested for enrollment, licensing, voter registration, and other administrative procedures.",
  output: "Active Kebele/residency ID card or renewal validation.",
  location: "Local Kebele or district civil registration and residency office",
  attendance_modes: ["in_person"],
  links: [
    { label: "Addis Civil Registration Services", url: "https://www.aacrrsa.gov.et/directorates/services/detail/7" }
  ]
};

CREATE process:drivers_license_issue CONTENT {
  title: "Driver License Issuance / Renewal",
  category: "Transport",
  summary: "Apply for first-time driver licensing or renew an existing license through authorized transport offices.",
  explanation: "A driver license certifies that the holder is legally authorized to operate a vehicle class. This process covers testing, issuance, and renewal requirements.",
  output: "Valid driver license card for the approved vehicle class.",
  location: "Driver and Vehicle License Control Authority branches",
  attendance_modes: ["in_person"],
  links: [
    { label: "DVLCA", url: "https://www.dvlca.gov.et/" }
  ]
};

CREATE process:voter_registration CONTENT {
  title: "Voter Registration Card",
  category: "Civic",
  summary: "Register as a voter during NEBE registration windows and obtain your voter registration card.",
  explanation: "Voter registration creates your election roll record and ties you to a designated polling station for national and local elections.",
  output: "Voter registration card and polling-station assignment.",
  location: "Polling station in your kebele/constituency during NEBE timetable",
  attendance_modes: ["in_person"],
  links: [
    { label: "NEBE Voter Registration", url: "https://nebe.org.et/en/voters-registration" }
  ]
};

CREATE process:student_id_card CONTENT {
  title: "Student ID Card Issuance",
  category: "Education",
  summary: "Obtain and renew student ID through your school or university registrar office.",
  explanation: "A student ID proves active enrollment and grants access to institutional services such as exams, libraries, and campus administration.",
  output: "Issued/renewed student ID card linked to current enrollment.",
  location: "Registrar office at your school/university",
  attendance_modes: ["in_person"],
  links: [
    { label: "Haramaya University Registrar (ID Card)", url: "https://www.hu.edu.et/index.php/admission-regst" },
    { label: "Mattu University Registrar", url: "https://www.meu.edu.et/menu/10/registrar" }
  ]
};

CREATE process:tin_registration CONTENT {
  title: "Tax Identification Number (TIN)",
  category: "Tax",
  summary: "Register as a taxpayer and receive your TIN for licensing, tax filing, and formal business activity.",
  explanation: "A TIN uniquely identifies individuals and businesses in Ethiopia's tax system and is required for tax filing, licensing, and many formal transactions.",
  output: "Assigned TIN and taxpayer registration record.",
  location: "Ministry of Revenues branches or integrated digital business/tax channels",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "Ethiopian Business Portal", url: "https://www.new.business.gov.et/" },
    { label: "Ministry of Revenues", url: "https://www.mor.gov.et/web/mor/mor" }
  ]
};

CREATE process:birth_certificate_issuance CONTENT {
  title: "Birth Certificate Issuance",
  category: "Civil Registration",
  summary: "Register birth details at civil registration and obtain an official birth certificate extract.",
  explanation: "A birth certificate is the foundational civil status record used in identity, education, passport, and many public services.",
  output: "Official birth certificate extract with civil registry record.",
  location: "Civil registration office serving place of birth/residence",
  attendance_modes: ["in_person"],
  links: [
    { label: "Addis Civil Registration Services", url: "https://www.aacrrsa.gov.et/directorates/services/detail/7" }
  ]
};

CREATE process:marriage_certificate_registration CONTENT {
  title: "Marriage Certificate Registration",
  category: "Civil Registration",
  summary: "Register marriage at civil registry and receive certified marriage certificate records.",
  explanation: "Marriage registration establishes legal marital status for residence permits, inheritance, and related civil and immigration procedures.",
  output: "Certified marriage certificate and registry entry.",
  location: "Civil registration office where marriage is registered",
  attendance_modes: ["in_person"],
  links: [
    { label: "Addis Civil Registration Services", url: "https://www.aacrrsa.gov.et/directorates/services/detail/7" }
  ]
};

CREATE process:police_clearance_certificate CONTENT {
  title: "Police Clearance Certificate",
  category: "Security",
  summary: "Request criminal record clearance, complete identity verification, and collect the certificate.",
  explanation: "Police clearance is commonly required for employment, visa/residence, licensing, and institutional compliance checks.",
  output: "Police clearance certificate or official status response.",
  location: "Federal Police service center or designated police clearance office",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "Ethiopian Federal Police", url: "https://www.federalpolice.gov.et/" }
  ]
};

CREATE process:work_permit_foreign_employee CONTENT {
  title: "Work Permit (Foreign Employee)",
  category: "Labor",
  summary: "Employer-sponsored process to obtain legal work authorization for a foreign employee.",
  explanation: "A work permit authorizes a foreign national to legally work in Ethiopia under a sponsoring employer and defined role.",
  output: "Approved work permit or formal decision.",
  location: "Labor and skills authority office or official online filing channel",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "Ministry of Labor and Skills", url: "https://www.mols.gov.et/" }
  ]
};

CREATE process:electricity_new_connection CONTENT {
  title: "New Electricity Connection",
  category: "Utilities",
  summary: "Apply for a new utility connection, complete site verification, pay fees, and activate service.",
  explanation: "New electricity connection is required for homes and businesses to activate meter-based utility service at a new site.",
  output: "Installed meter and active customer electricity account.",
  location: "Ethiopian Electric Utility customer service center / approved digital channel",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "Ethiopian Electric Utility", url: "https://www.eeu.gov.et/" }
  ]
};

CREATE process:death_certificate_issuance CONTENT {
  title: "Death Certificate Issuance",
  category: "Civil Registration",
  summary: "Register death details at civil registry and obtain official death certificate extract.",
  explanation: "A death certificate is an official civil-status record required for inheritance, pension, insurance, and estate administration procedures.",
  output: "Certified death certificate extract and registry record.",
  location: "Civil registration office serving place of death/residence",
  attendance_modes: ["in_person"],
  links: [
    { label: "Addis Civil Registration Services", url: "https://www.aacrrsa.gov.et/directorates/services/detail/7" }
  ]
};

CREATE process:divorce_certificate_registration CONTENT {
  title: "Divorce Certificate Registration",
  category: "Civil Registration",
  summary: "Register finalized divorce records with civil registry and collect certified divorce certificate.",
  explanation: "Divorce certificate registration formalizes marital status changes for legal, administrative, and immigration purposes.",
  output: "Certified divorce certificate and updated civil status record.",
  location: "Civil registration office where divorce is registered",
  attendance_modes: ["in_person"],
  links: [
    { label: "Addis Civil Registration Services", url: "https://www.aacrrsa.gov.et/directorates/services/detail/7" }
  ]
};

CREATE process:business_name_reservation CONTENT {
  title: "Business Name Reservation",
  category: "Business",
  summary: "Reserve a business name before commercial registration and keep reservation reference for filing.",
  explanation: "Name reservation checks availability and temporarily protects your selected business name so you can continue to registration and licensing.",
  output: "Business name reservation confirmation/reference.",
  location: "Online via eTrade and at MoTRI/regional trade offices where required",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "eTrade Portal", url: "https://etrade.gov.et" },
    { label: "MoTRI", url: "https://www.motri.gov.et" }
  ]
};

CREATE process:vat_registration CONTENT {
  title: "VAT Registration",
  category: "Tax",
  summary: "Register for VAT with the tax authority once eligibility conditions are met.",
  explanation: "VAT registration enrolls your business in value-added tax compliance, enabling VAT invoicing and periodic return filing.",
  output: "VAT registration confirmation/certificate linked to your TIN.",
  location: "Ministry of Revenues branch or approved online filing channel",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "Ministry of Revenues", url: "https://www.mor.gov.et/web/mor/mor" },
    { label: "Ethiopian Business Portal", url: "https://www.new.business.gov.et/" }
  ]
};

CREATE process:import_export_code_registration CONTENT {
  title: "Importer / Exporter Code Registration",
  category: "Trade",
  summary: "Register for importer/exporter code after business, tax, and licensing prerequisites are complete.",
  explanation: "Importer/exporter registration enables formal cross-border trade operations and related customs/banking workflows.",
  output: "Active importer/exporter registration code.",
  location: "Trade and revenue service offices, plus approved digital channels",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "eTrade Portal", url: "https://etrade.gov.et" },
    { label: "Ethiopian Business Portal", url: "https://www.new.business.gov.et/" }
  ]
};

CREATE process:building_construction_permit CONTENT {
  title: "Building Construction Permit",
  category: "Urban Development",
  summary: "Submit land and design documents, pass technical review, and receive construction permit.",
  explanation: "Construction permits authorize legal building activity and define inspection checkpoints for code compliance.",
  output: "Approved building permit and inspection pathway.",
  location: "City/regional construction permit and control authority office",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "Addis Permit and Control", url: "https://www.aacpco.gov.et/" }
  ]
};

CREATE process:water_new_connection CONTENT {
  title: "New Water Connection",
  category: "Utilities",
  summary: "Apply for water utility connection, complete site survey, and activate service.",
  explanation: "A new water connection establishes metered utility service for homes and businesses at a new site.",
  output: "Installed water meter and active utility account.",
  location: "City water and sewerage authority customer service office",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "Addis Ababa Water and Sewerage Authority", url: "https://www.aawsa.gov.et/" }
  ]
};

CREATE process:vehicle_ownership_transfer CONTENT {
  title: "Vehicle Ownership Transfer",
  category: "Transport",
  summary: "Transfer legal ownership after inspection, fee settlement, and registry update.",
  explanation: "Ownership transfer updates the legal vehicle registry after sale or assignment, protecting both buyer and seller.",
  output: "Updated vehicle ownership record/book in the new owner's name.",
  location: "Driver and Vehicle License Control Authority branch",
  attendance_modes: ["in_person"],
  links: [
    { label: "DVLCA", url: "https://www.dvlca.gov.et/" }
  ]
};

CREATE process:land_holding_certificate_issuance CONTENT {
  title: "Land Holding Certificate Issuance",
  category: "Land",
  summary: "Register parcel ownership/holding evidence and obtain official land holding certificate.",
  explanation: "A land holding certificate confirms recognized holding rights for a parcel and is commonly required for transfer, mortgage, and construction permit workflows.",
  output: "Issued land holding certificate/registry extract.",
  location: "City/regional land administration and land information service office",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "Addis Ababa City Administration", url: "https://www.aaca.gov.et/" }
  ]
};

CREATE process:land_lease_transfer CONTENT {
  title: "Land Lease / Holding Transfer",
  category: "Land",
  summary: "Transfer land lease/holding rights after compliance checks, tax clearance, and registry approval.",
  explanation: "Lease/holding transfer updates legal land records after sale/assignment and is required to protect buyer and seller rights in future transactions.",
  output: "Updated land lease/holding registry record under new holder.",
  location: "City/regional land administration transfer desk",
  attendance_modes: ["in_person"],
  links: [
    { label: "Addis Ababa City Administration", url: "https://www.aaca.gov.et/" }
  ]
};

CREATE process:cadastral_map_and_boundary_certificate CONTENT {
  title: "Cadastral Map and Boundary Certificate",
  category: "Land",
  summary: "Request cadastral survey, confirm parcel boundaries, and collect certified cadastral map output.",
  explanation: "Cadastral map/boundary certification provides official parcel geometry and boundary confirmation, often required for holding certificate, transfer, and permitting.",
  output: "Certified cadastral map and boundary confirmation record.",
  location: "Land survey/cadastre service office in your city or region",
  attendance_modes: ["in_person", "online"],
  links: [
    { label: "Addis Ababa City Administration", url: "https://www.aaca.gov.et/" }
  ]
};

CREATE process:property_mortgage_registration CONTENT {
  title: "Property Mortgage Registration",
  category: "Land",
  summary: "Register mortgage encumbrance on property records after loan and title verification.",
  explanation: "Mortgage registration creates official encumbrance records on land/property, which lenders require to perfect security interests.",
  output: "Registered mortgage/encumbrance entry and confirmation document.",
  location: "Land registry/encumbrance registration office",
  attendance_modes: ["in_person"],
  links: [
    { label: "Addis Ababa City Administration", url: "https://www.aaca.gov.et/" }
  ]
};

CREATE process:medical_death_notice CONTENT {
  title: "Medical Death Notice Issuance",
  category: "Health",
  summary: "Obtain an official medical death notice from the health facility to support civil death registration.",
  explanation: "A medical death notice is typically issued by a health facility after death confirmation. It is commonly used as primary supporting evidence when registering a death in civil registry.",
  output: "Signed/stamped medical death notice document.",
  location: "Hospital or health facility where death is confirmed",
  attendance_modes: ["in_person"],
  links: [
    { label: "Ministry of Health", url: "https://www.moh.gov.et/" }
  ]
};

CREATE process:witness_affidavit_notarization CONTENT {
  title: "Witness Statement / Affidavit Notarization",
  category: "Legal",
  summary: "Prepare and notarize witness statement/affidavit for use in official administrative procedures.",
  explanation: "When primary documentary evidence is missing, authorities may accept notarized witness statements. This process covers preparing the statement, appearing before the competent authority, and collecting the notarized output.",
  output: "Notarized witness statement/affidavit.",
  location: "Notary/document authentication office or other competent legal authority",
  attendance_modes: ["in_person"],
  links: [
    { label: "Ministry of Justice", url: "https://moj.gov.et/" }
  ]
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
  description: "Prepare authenticated birth certificate (required for applicants under 40 per ICS guidance).",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Birth Certificate", process_key: "birth_certificate_issuance" }
  ]
};
CREATE task:passport_kebele_id CONTENT {
  title: "Kebele ID or Support Letter",
  description: "Bring renewed Kebele ID. If temporary ID is used, include official support letter from issuing office.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" }
  ]
};
CREATE task:passport_fayda_id CONTENT {
  title: "Fayda / National ID Ready",
  description: "Prepare Fayda/National ID credentials where required for online service account verification.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Fayda ID / FIN", process_key: "fayda_registration" }
  ]
};

CREATE task:passport_online_application CONTENT {
  title: "Complete Online Application",
  description: "Create or log into the passport e-service, complete form details, and confirm appointment slot.",
  links: [
    { label: "ICS Online Services", url: "https://www.ics.gov.et/service" }
  ]
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
  description: "Bring originals and complete fingerprint/photo capture at the assigned office.",
  location: "Assigned ICS branch from appointment confirmation"
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
  description: "Appear for collection with required reference slip and ID.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" }
  ]
};

RELATE process:passport->requires->task:passport_prepare_docs SET sort_order = 1;
RELATE process:passport->requires->task:passport_online_application SET sort_order = 2;
RELATE process:passport->requires->task:passport_appointment SET sort_order = 3;
RELATE process:passport->requires->task:passport_collection SET sort_order = 4;

RELATE task:passport_prepare_docs->requires->task:passport_birth_certificate SET sort_order = 1;
RELATE task:passport_prepare_docs->requires->task:passport_kebele_id SET sort_order = 2;
RELATE task:passport_prepare_docs->requires->task:passport_fayda_id SET sort_order = 3;

RELATE task:passport_online_application->requires->task:passport_fill_form SET sort_order = 1;
RELATE task:passport_online_application->requires->task:passport_pay_window SET sort_order = 2;
RELATE task:passport_online_application->requires->task:passport_keep_confirmation SET sort_order = 3;

RELATE task:passport_appointment->requires->task:passport_bring_originals SET sort_order = 1;
RELATE task:passport_appointment->requires->task:passport_biometrics SET sort_order = 2;

RELATE task:passport_collection->requires->task:passport_track_status SET sort_order = 1;
RELATE task:passport_collection->requires->task:passport_collect SET sort_order = 2;

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
  description: "Use accepted proof (e.g., old Kebele ID, passport, driver license, voter ID, student ID, tax ID, etc.).",
  links: [
    { label: "Fayda Accepted Identity Proofs", url: "https://id.gov.et/proof" }
  ],
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" },
    { name: "Driver License", process_key: "drivers_license_issue" },
    { name: "Voter ID Card", process_key: "voter_registration" },
    { name: "Student ID Card", process_key: "student_id_card" },
    { name: "Tax Identification Number (TIN)", process_key: "tin_registration" }
  ]
};
CREATE task:fayda_address_proof CONTENT {
  title: "Address Proof or Witness",
  description: "Bring accepted residence evidence (utility/rental/bank/insurance docs) or approved witness route."
};

CREATE task:fayda_choose_center CONTENT {
  title: "Choose Registration Center",
  description: "Select nearby official enrollment center (ethio telecom, banks, post office, or designated center).",
  location: "Nearest Fayda enrollment center",
  links: [
    { label: "Find Fayda Center", url: "https://id.gov.et/service-locations" }
  ]
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
  description: "Receive your Fayda Identification Number (FIN) and activate digital credential flow.",
  location: "At the same enrollment center and official follow-up channels"
};
CREATE task:fayda_fin_sms CONTENT {
  title: "Receive FIN Notification",
  description: "Check SMS/official notification for FIN and enrollment confirmation."
};
CREATE task:fayda_credential CONTENT {
  title: "Activate Credential",
  description: "Download/activate available digital credential or follow up for physical credential options."
};

RELATE process:fayda_registration->requires->task:fayda_prepare_evidence SET sort_order = 1;
RELATE process:fayda_registration->requires->task:fayda_choose_center SET sort_order = 2;
RELATE process:fayda_registration->requires->task:fayda_biometrics SET sort_order = 3;
RELATE process:fayda_registration->requires->task:fayda_get_fin SET sort_order = 4;

RELATE task:fayda_prepare_evidence->requires->task:fayda_identity_proof SET sort_order = 1;
RELATE task:fayda_prepare_evidence->requires->task:fayda_address_proof SET sort_order = 2;

RELATE task:fayda_choose_center->requires->task:fayda_pre_register SET sort_order = 1;
RELATE task:fayda_choose_center->requires->task:fayda_visit_center SET sort_order = 2;

RELATE task:fayda_biometrics->requires->task:fayda_demographics SET sort_order = 1;
RELATE task:fayda_biometrics->requires->task:fayda_bio_capture SET sort_order = 2;

RELATE task:fayda_get_fin->requires->task:fayda_fin_sms SET sort_order = 1;
RELATE task:fayda_get_fin->requires->task:fayda_credential SET sort_order = 2;

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
  description: "Obtain valid TIN certificate before filing commercial registration.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "TIN", process_key: "tin_registration" }
  ]
};
CREATE task:cr_id CONTENT {
  title: "Valid ID / Passport",
  description: "Prepare owner/manager identification document.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:cr_poa CONTENT {
  title: "Power of Attorney (if represented)",
  description: "If an agent files on your behalf, prepare notarized power of attorney and agent ID.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Witness Statement / Affidavit", process_key: "witness_affidavit_notarization" }
  ]
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
  description: "Submit application through the designated online government platform and follow correction requests.",
  links: [
    { label: "eTrade Portal", url: "https://etrade.gov.et" }
  ]
};
CREATE task:cr_online_submission CONTENT {
  title: "Online Submission",
  description: "Upload all documents and complete registration form accurately."
};
CREATE task:cr_get_certificate CONTENT {
  title: "Receive Registration Output",
  description: "Download/collect registration certificate and keep it for licensing workflow."
};

RELATE process:commercial_registration->requires->task:cr_prepare_core_documents SET sort_order = 1;
RELATE process:commercial_registration->requires->task:cr_prepare_business_evidence SET sort_order = 2;
RELATE process:commercial_registration->requires->task:cr_submit SET sort_order = 3;

RELATE task:cr_prepare_core_documents->requires->task:cr_tin SET sort_order = 1;
RELATE task:cr_prepare_core_documents->requires->task:cr_id SET sort_order = 2;
RELATE task:cr_prepare_core_documents->requires->task:cr_poa SET sort_order = 3;

RELATE task:cr_prepare_business_evidence->requires->task:cr_legal_existence SET sort_order = 1;
RELATE task:cr_prepare_business_evidence->requires->task:cr_branch_resolution SET sort_order = 2;
RELATE task:cr_prepare_business_evidence->requires->task:cr_support_letter SET sort_order = 3;

RELATE task:cr_submit->requires->task:cr_online_submission SET sort_order = 1;
RELATE task:cr_submit->requires->task:cr_get_certificate SET sort_order = 2;

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
  description: "Confirm valid registration details before licensing.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Commercial Registration Certificate", process_key: "commercial_registration" }
  ]
};
CREATE task:tln_competency CONTENT {
  title: "Competency Certificate",
  description: "Obtain competency proof for regulated business activity categories."
};

CREATE task:tln_application CONTENT {
  title: "Submit New License Application",
  description: "File a new trade license request through official portal with activity details and attachments.",
  links: [
    { label: "eTrade Portal", url: "https://etrade.gov.et" }
  ],
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Commercial Registration Certificate", process_key: "commercial_registration" },
    { name: "TIN", process_key: "tin_registration" }
  ]
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

RELATE process:trade_license_new->requires->task:tln_prerequisites SET sort_order = 1;
RELATE process:trade_license_new->requires->task:tln_application SET sort_order = 2;
RELATE process:trade_license_new->requires->task:tln_receive SET sort_order = 3;

RELATE task:tln_prerequisites->requires->task:tln_has_registration SET sort_order = 1;
RELATE task:tln_prerequisites->requires->task:tln_competency SET sort_order = 2;

RELATE task:tln_application->requires->task:tln_activity_selection SET sort_order = 1;
RELATE task:tln_application->requires->task:tln_upload_documents SET sort_order = 2;

RELATE task:tln_receive->requires->task:tln_verify SET sort_order = 1;
RELATE task:tln_receive->requires->task:tln_archive SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Trade license renewal tasks
-- Source: MoTRI requirement pages
-- ---------------------------------------------------------------------
CREATE task:tlr_prepare CONTENT {
  title: "Prepare Renewal Documents",
  description: "Gather annual compliance documents required before filing renewal.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Current Trade License", process_key: "trade_license_new" }
  ]
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
  description: "Submit renewal online before license expiry and complete fee obligations.",
  links: [
    { label: "eTrade Portal", url: "https://etrade.gov.et" }
  ]
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

RELATE process:trade_license_renewal->requires->task:tlr_prepare SET sort_order = 1;
RELATE process:trade_license_renewal->requires->task:tlr_submit SET sort_order = 2;
RELATE process:trade_license_renewal->requires->task:tlr_receive SET sort_order = 3;

RELATE task:tlr_prepare->requires->task:tlr_audit SET sort_order = 1;
RELATE task:tlr_prepare->requires->task:tlr_tax_clearance SET sort_order = 2;

RELATE task:tlr_submit->requires->task:tlr_before_expiry SET sort_order = 1;
RELATE task:tlr_submit->requires->task:tlr_fee SET sort_order = 2;

RELATE task:tlr_receive->requires->task:tlr_verify SET sort_order = 1;
RELATE task:tlr_receive->requires->task:tlr_archive SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Business visa tasks
-- Source: Ethiopian Immigration and Citizenship Service business visa page
-- ---------------------------------------------------------------------
CREATE task:bv_prepare_documents CONTENT {
  title: "Prepare Visa Documents",
  description: "Collect passport, photos, invitation letter, and business proof documents.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:bv_passport CONTENT {
  title: "Valid Passport",
  description: "Passport must be valid for at least six months from intended entry date.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Passport", process_key: "passport" }
  ]
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
  description: "Complete application form, upload documents, and pay required fee.",
  links: [
    { label: "ICS Services", url: "https://www.ics.gov.et/service" }
  ]
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

RELATE process:business_visa->requires->task:bv_prepare_documents SET sort_order = 1;
RELATE process:business_visa->requires->task:bv_submit SET sort_order = 2;
RELATE process:business_visa->requires->task:bv_followup SET sort_order = 3;

RELATE task:bv_prepare_documents->requires->task:bv_passport SET sort_order = 1;
RELATE task:bv_prepare_documents->requires->task:bv_photos SET sort_order = 2;
RELATE task:bv_prepare_documents->requires->task:bv_invitation SET sort_order = 3;

RELATE task:bv_submit->requires->task:bv_form SET sort_order = 1;
RELATE task:bv_submit->requires->task:bv_fee SET sort_order = 2;

RELATE task:bv_followup->requires->task:bv_track SET sort_order = 1;
RELATE task:bv_followup->requires->task:bv_additional SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Temporary residence permit by marriage tasks
-- Source: Ethiopian Immigration and Citizenship Service residence permit page
-- ---------------------------------------------------------------------
CREATE task:trm_prepare_passport_visa CONTENT {
  title: "Prepare Passport and Visa Records",
  description: "Prepare passport and visa copies required for residence permit filing.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Passport", process_key: "passport" }
  ]
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
  description: "Prepare marriage certificate and spouse identity evidence.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Marriage Certificate", process_key: "marriage_certificate_registration" }
  ]
};
CREATE task:trm_marriage_certificate CONTENT {
  title: "Authenticated Marriage Certificate",
  description: "Prepare properly authenticated marriage certificate.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Marriage Certificate", process_key: "marriage_certificate_registration" }
  ]
};
CREATE task:trm_translation CONTENT {
  title: "Translation (if needed)",
  description: "If certificate is not in English/Amharic as required, prepare official translation."
};
CREATE task:trm_spouse_id CONTENT {
  title: "Spouse ID / Passport",
  description: "Prepare Ethiopian spouse Kebele ID or passport copy.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" }
  ]
};

CREATE task:trm_submit CONTENT {
  title: "Submit Residence Application",
  description: "Submit completed form with photos and required in-person attendance.",
  location: "ICS residence service desk",
  links: [
    { label: "Residence Services", url: "https://www.ics.gov.et/service" }
  ]
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

RELATE process:temporary_residence_marriage->requires->task:trm_prepare_passport_visa SET sort_order = 1;
RELATE process:temporary_residence_marriage->requires->task:trm_prepare_marriage_documents SET sort_order = 2;
RELATE process:temporary_residence_marriage->requires->task:trm_submit SET sort_order = 3;
RELATE process:temporary_residence_marriage->requires->task:trm_renewal SET sort_order = 4;

RELATE task:trm_prepare_passport_visa->requires->task:trm_passport_validity SET sort_order = 1;
RELATE task:trm_prepare_passport_visa->requires->task:trm_visa_stamp_copy SET sort_order = 2;
RELATE task:trm_prepare_passport_visa->requires->task:trm_extended_visa_copy SET sort_order = 3;

RELATE task:trm_prepare_marriage_documents->requires->task:trm_marriage_certificate SET sort_order = 1;
RELATE task:trm_prepare_marriage_documents->requires->task:trm_translation SET sort_order = 2;
RELATE task:trm_prepare_marriage_documents->requires->task:trm_spouse_id SET sort_order = 3;

RELATE task:trm_submit->requires->task:trm_form SET sort_order = 1;
RELATE task:trm_submit->requires->task:trm_photos SET sort_order = 2;
RELATE task:trm_submit->requires->task:trm_spouse_presence SET sort_order = 3;

RELATE task:trm_renewal->requires->task:trm_expiry_monitor SET sort_order = 1;
RELATE task:trm_renewal->requires->task:trm_renew_before_expiry SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Ethiopian Origin ID tasks
-- Source: Ethiopian Immigration and Citizenship Service origin ID page
-- ---------------------------------------------------------------------
CREATE task:eoid_prepare_core CONTENT {
  title: "Prepare Core Application Documents",
  description: "Prepare form, passport, visa, and entry-stamp related requirements.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:eoid_form CONTENT {
  title: "Application Form",
  description: "Complete Ethiopian Origin ID application form."
};
CREATE task:eoid_passport CONTENT {
  title: "Passport Validity (6+ months)",
  description: "Prepare valid passport with minimum six months validity.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Passport", process_key: "passport" }
  ]
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
  description: "Provide old machine-readable Ethiopian passport or authenticated birth certificate.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Birth Certificate", process_key: "birth_certificate_issuance" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:eoid_parent_id CONTENT {
  title: "Parent Kebele ID or Passport",
  description: "Provide parent Kebele ID/passport copy as supporting lineage proof.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:eoid_previous_kebele_if_foreign CONTENT {
  title: "Previous Kebele ID (if applicable)",
  description: "If applicant is now a foreign citizen, include previous Ethiopian Kebele ID evidence where available.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" }
  ]
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
  description: "When primary lineage documents are missing, include alternate evidence such as death certificate, as requested.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Birth Certificate", process_key: "birth_certificate_issuance" },
    { name: "Marriage Certificate", process_key: "marriage_certificate_registration" },
    { name: "Divorce Certificate", process_key: "divorce_certificate_registration" },
    { name: "Death Certificate", process_key: "death_certificate_issuance" },
    { name: "Witness Statement / Affidavit", process_key: "witness_affidavit_notarization" }
  ]
};

CREATE task:eoid_submit CONTENT {
  title: "Submit and Follow Up",
  description: "Submit in person (no proxy), track issuance, and monitor renewal timeline.",
  location: "ICS origin ID service desk",
  links: [
    { label: "Origin ID Services", url: "https://www.ics.gov.et/service" }
  ]
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

RELATE process:ethiopian_origin_id->requires->task:eoid_prepare_core SET sort_order = 1;
RELATE process:ethiopian_origin_id->requires->task:eoid_prove_origin SET sort_order = 2;
RELATE process:ethiopian_origin_id->requires->task:eoid_special_cases SET sort_order = 3;
RELATE process:ethiopian_origin_id->requires->task:eoid_submit SET sort_order = 4;

RELATE task:eoid_prepare_core->requires->task:eoid_form SET sort_order = 1;
RELATE task:eoid_prepare_core->requires->task:eoid_passport SET sort_order = 2;
RELATE task:eoid_prepare_core->requires->task:eoid_visa_and_stamp SET sort_order = 3;
RELATE task:eoid_prepare_core->requires->task:eoid_extended_visa SET sort_order = 4;

RELATE task:eoid_prove_origin->requires->task:eoid_old_passport_or_birth SET sort_order = 1;
RELATE task:eoid_prove_origin->requires->task:eoid_parent_id SET sort_order = 2;
RELATE task:eoid_prove_origin->requires->task:eoid_previous_kebele_if_foreign SET sort_order = 3;

RELATE task:eoid_special_cases->requires->task:eoid_under18_adoption SET sort_order = 1;
RELATE task:eoid_special_cases->requires->task:eoid_name_change SET sort_order = 2;
RELATE task:eoid_special_cases->requires->task:eoid_document_gap SET sort_order = 3;

RELATE task:eoid_submit->requires->task:eoid_photo SET sort_order = 1;
RELATE task:eoid_submit->requires->task:eoid_in_person SET sort_order = 2;
RELATE task:eoid_submit->requires->task:eoid_track SET sort_order = 3;

-- ---------------------------------------------------------------------
-- Kebele ID issuance/renewal tasks
-- Source: Addis Ababa Civil Registration and Residency Service Agency pages
-- ---------------------------------------------------------------------
CREATE task:kebele_prepare_documents CONTENT {
  title: "Prepare Residency Documents",
  description: "Prepare required residency and identity evidence before visiting the kebele office.",
  location: "Your local kebele administration office",
  links: [
    { label: "Kebele Services Detail", url: "https://www.aacrrsa.gov.et/directorates/services/detail/7" }
  ]
};
CREATE task:kebele_residence_evidence CONTENT {
  title: "Residence Evidence",
  description: "Prepare house number / rent evidence or other residency proof required by your kebele."
};
CREATE task:kebele_identity_evidence CONTENT {
  title: "Identity Evidence",
  description: "Prepare birth record, old ID, or equivalent identity evidence requested by the office.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Fayda ID / FIN", process_key: "fayda_registration" },
    { name: "Passport", process_key: "passport" },
    { name: "Birth Certificate", process_key: "birth_certificate_issuance" }
  ]
};

CREATE task:kebele_submit_request CONTENT {
  title: "Submit Application at Kebele",
  description: "Submit request form in person and complete any local verification steps.",
  location: "Kebele front office / civil registration desk"
};
CREATE task:kebele_form_submission CONTENT {
  title: "Complete and Submit Form",
  description: "Fill the official kebele ID form and submit with supporting documents."
};
CREATE task:kebele_fee_receipt CONTENT {
  title: "Pay Applicable Service Fee",
  description: "Pay any service fee and keep payment receipt."
};

CREATE task:kebele_collect_card CONTENT {
  title: "Collect or Renew Kebele ID",
  description: "Return on the advised date to collect issued/renewed ID and verify details."
};
CREATE task:kebele_verify_card CONTENT {
  title: "Verify Card Details",
  description: "Verify name, address, and validity period before leaving the office."
};
CREATE task:kebele_renewal_cycle CONTENT {
  title: "Track Renewal Period",
  description: "Set reminders for renewals so the ID stays valid for dependent services."
};

RELATE process:kebele_id_residency->requires->task:kebele_prepare_documents SET sort_order = 1;
RELATE process:kebele_id_residency->requires->task:kebele_submit_request SET sort_order = 2;
RELATE process:kebele_id_residency->requires->task:kebele_collect_card SET sort_order = 3;

RELATE task:kebele_prepare_documents->requires->task:kebele_residence_evidence SET sort_order = 1;
RELATE task:kebele_prepare_documents->requires->task:kebele_identity_evidence SET sort_order = 2;

RELATE task:kebele_submit_request->requires->task:kebele_form_submission SET sort_order = 1;
RELATE task:kebele_submit_request->requires->task:kebele_fee_receipt SET sort_order = 2;

RELATE task:kebele_collect_card->requires->task:kebele_verify_card SET sort_order = 1;
RELATE task:kebele_collect_card->requires->task:kebele_renewal_cycle SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Driver license issuance/renewal tasks
-- Source: Driver and Vehicle License Control Authority (DVLCA)
-- ---------------------------------------------------------------------
CREATE task:dl_prepare_prerequisites CONTENT {
  title: "Prepare Licensing Prerequisites",
  description: "Prepare required identity and training/medical prerequisites before testing.",
  location: "Authorized transport service center",
  links: [
    { label: "DVLCA Services", url: "https://www.dvlca.gov.et/" }
  ],
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:dl_medical_certificate CONTENT {
  title: "Medical Fitness Certificate",
  description: "Obtain medical fitness evidence as required for license class."
};
CREATE task:dl_training_records CONTENT {
  title: "Training School Records",
  description: "Prepare approved driving school completion evidence where required."
};

CREATE task:dl_examinations CONTENT {
  title: "Take Required Examinations",
  description: "Complete theory and practical tests for your target license class.",
  location: "Testing center assigned by transport authority"
};
CREATE task:dl_theory_test CONTENT {
  title: "Theory Test",
  description: "Pass the road rules and traffic signs exam."
};
CREATE task:dl_practical_test CONTENT {
  title: "Practical Driving Test",
  description: "Pass practical driving assessment by authorized examiner."
};

CREATE task:dl_issue_or_renew CONTENT {
  title: "Issue or Renew License Card",
  description: "Pay issuance/renewal fee and collect printed license.",
  location: "DVLCA branch issuing office"
};
CREATE task:dl_fee_payment CONTENT {
  title: "Fee Payment",
  description: "Pay official fee and retain receipt for card collection."
};
CREATE task:dl_collect_license CONTENT {
  title: "Collect License Card",
  description: "Collect card and verify class/category and validity dates."
};

RELATE process:drivers_license_issue->requires->task:dl_prepare_prerequisites SET sort_order = 1;
RELATE process:drivers_license_issue->requires->task:dl_examinations SET sort_order = 2;
RELATE process:drivers_license_issue->requires->task:dl_issue_or_renew SET sort_order = 3;

RELATE task:dl_prepare_prerequisites->requires->task:dl_medical_certificate SET sort_order = 1;
RELATE task:dl_prepare_prerequisites->requires->task:dl_training_records SET sort_order = 2;

RELATE task:dl_examinations->requires->task:dl_theory_test SET sort_order = 1;
RELATE task:dl_examinations->requires->task:dl_practical_test SET sort_order = 2;

RELATE task:dl_issue_or_renew->requires->task:dl_fee_payment SET sort_order = 1;
RELATE task:dl_issue_or_renew->requires->task:dl_collect_license SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Voter registration card tasks
-- Source: National Election Board of Ethiopia (NEBE)
-- ---------------------------------------------------------------------
CREATE task:voter_check_eligibility CONTENT {
  title: "Check Voter Eligibility",
  description: "Confirm age, citizenship, and residence eligibility before registration window opens.",
  links: [
    { label: "NEBE Voter Registration", url: "https://nebe.org.et/en/voters-registration" }
  ]
};
CREATE task:voter_age_citizenship CONTENT {
  title: "Age and Citizenship Requirement",
  description: "Confirm you meet minimum age and citizenship requirements."
};
CREATE task:voter_residence_proof CONTENT {
  title: "Residence Proof",
  description: "Prepare local residence evidence accepted by the registration station.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" }
  ]
};

CREATE task:voter_register_person CONTENT {
  title: "Register In Person",
  description: "Appear in person at designated polling station during registration period.",
  location: "Designated polling station in your kebele"
};
CREATE task:voter_present_documents CONTENT {
  title: "Present Supporting Documents",
  description: "Present accepted identity/residence documents requested by officers.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:voter_capture_details CONTENT {
  title: "Record and Validate Details",
  description: "Validate your demographic details before submission."
};

CREATE task:voter_collect_card CONTENT {
  title: "Collect Voter Card",
  description: "Collect your voter card and verify polling location details."
};
CREATE task:voter_verify_card CONTENT {
  title: "Verify Card Information",
  description: "Verify full name and polling station assignment."
};
CREATE task:voter_keep_card CONTENT {
  title: "Keep Card Safe",
  description: "Store card securely for election day use."
};

RELATE process:voter_registration->requires->task:voter_check_eligibility SET sort_order = 1;
RELATE process:voter_registration->requires->task:voter_register_person SET sort_order = 2;
RELATE process:voter_registration->requires->task:voter_collect_card SET sort_order = 3;

RELATE task:voter_check_eligibility->requires->task:voter_age_citizenship SET sort_order = 1;
RELATE task:voter_check_eligibility->requires->task:voter_residence_proof SET sort_order = 2;

RELATE task:voter_register_person->requires->task:voter_present_documents SET sort_order = 1;
RELATE task:voter_register_person->requires->task:voter_capture_details SET sort_order = 2;

RELATE task:voter_collect_card->requires->task:voter_verify_card SET sort_order = 1;
RELATE task:voter_collect_card->requires->task:voter_keep_card SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Student ID card tasks
-- Source: University registrar service pages
-- ---------------------------------------------------------------------
CREATE task:student_confirm_enrollment CONTENT {
  title: "Confirm Enrollment Status",
  description: "Ensure active enrollment and registrar record before requesting student ID.",
  location: "Registrar office",
  links: [
    { label: "Registrar Reference", url: "https://www.hu.edu.et/index.php/admission-regst" }
  ]
};
CREATE task:student_registration_record CONTENT {
  title: "Registration / Admission Record",
  description: "Prepare current registration or admission confirmation.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Birth Certificate", process_key: "birth_certificate_issuance" },
    { name: "Passport", process_key: "passport" },
    { name: "Kebele ID", process_key: "kebele_id_residency" }
  ]
};
CREATE task:student_fee_status CONTENT {
  title: "Fee and Clearance Status",
  description: "Complete tuition/clearance requirements required for ID issuance."
};

CREATE task:student_submit_id_request CONTENT {
  title: "Submit Student ID Request",
  description: "Submit ID request with photo and required academic records.",
  location: "Registrar ID card desk"
};
CREATE task:student_photo_submission CONTENT {
  title: "Submit Photo",
  description: "Provide passport-style photo according to institution format."
};
CREATE task:student_data_verification CONTENT {
  title: "Verify Student Data",
  description: "Verify spelling, department, and student number in the registrar system."
};

CREATE task:student_collect_or_replace CONTENT {
  title: "Collect or Replace Student ID",
  description: "Collect printed ID and follow replacement route if lost/damaged."
};
CREATE task:student_collect_card CONTENT {
  title: "Collect Student Card",
  description: "Collect card and validate details."
};
CREATE task:student_replacement CONTENT {
  title: "Replacement Request (If Needed)",
  description: "If card is lost/damaged, file replacement request with required evidence."
};

RELATE process:student_id_card->requires->task:student_confirm_enrollment SET sort_order = 1;
RELATE process:student_id_card->requires->task:student_submit_id_request SET sort_order = 2;
RELATE process:student_id_card->requires->task:student_collect_or_replace SET sort_order = 3;

RELATE task:student_confirm_enrollment->requires->task:student_registration_record SET sort_order = 1;
RELATE task:student_confirm_enrollment->requires->task:student_fee_status SET sort_order = 2;

RELATE task:student_submit_id_request->requires->task:student_photo_submission SET sort_order = 1;
RELATE task:student_submit_id_request->requires->task:student_data_verification SET sort_order = 2;

RELATE task:student_collect_or_replace->requires->task:student_collect_card SET sort_order = 1;
RELATE task:student_collect_or_replace->requires->task:student_replacement SET sort_order = 2;

-- ---------------------------------------------------------------------
-- TIN registration tasks
-- Source: Ethiopian business/tax public portals
-- ---------------------------------------------------------------------
CREATE task:tin_prepare_documents CONTENT {
  title: "Prepare Tax Registration Documents",
  description: "Prepare identity and business support documents required for TIN registration.",
  links: [
    { label: "Business Portal", url: "https://www.new.business.gov.et/" },
    { label: "Ministry of Revenues", url: "https://www.mor.gov.et/web/mor/mor" }
  ]
};
CREATE task:tin_identity_evidence CONTENT {
  title: "Identity Evidence",
  description: "Prepare accepted identity evidence for taxpayer registration.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:tin_business_support CONTENT {
  title: "Business Support Evidence (If Applicable)",
  description: "If registering a business taxpayer, include business and address evidence."
};

CREATE task:tin_submit_application CONTENT {
  title: "Submit TIN Registration Application",
  description: "Submit registration via the relevant revenue office or integrated portal channel.",
  location: "Ministry of Revenues office or online portal"
};
CREATE task:tin_complete_form CONTENT {
  title: "Complete Taxpayer Form",
  description: "Complete taxpayer registration form with matching personal/business details."
};
CREATE task:tin_receive_number CONTENT {
  title: "Receive TIN Number",
  description: "Receive your assigned TIN and keep registration proof."
};

CREATE task:tin_activate_profile CONTENT {
  title: "Activate Tax Profile",
  description: "Activate and maintain your tax profile for declarations/payments."
};
CREATE task:tin_portal_access CONTENT {
  title: "Enable Portal Access",
  description: "Set up login credentials for tax-related online services where available."
};
CREATE task:tin_keep_records CONTENT {
  title: "Keep TIN Records",
  description: "Store TIN certificate/reference for licensing and compliance workflows."
};

RELATE process:tin_registration->requires->task:tin_prepare_documents SET sort_order = 1;
RELATE process:tin_registration->requires->task:tin_submit_application SET sort_order = 2;
RELATE process:tin_registration->requires->task:tin_activate_profile SET sort_order = 3;

RELATE task:tin_prepare_documents->requires->task:tin_identity_evidence SET sort_order = 1;
RELATE task:tin_prepare_documents->requires->task:tin_business_support SET sort_order = 2;

RELATE task:tin_submit_application->requires->task:tin_complete_form SET sort_order = 1;
RELATE task:tin_submit_application->requires->task:tin_receive_number SET sort_order = 2;

RELATE task:tin_activate_profile->requires->task:tin_portal_access SET sort_order = 1;
RELATE task:tin_activate_profile->requires->task:tin_keep_records SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Birth certificate issuance tasks
-- Source: Civil registration agency service pages
-- ---------------------------------------------------------------------
CREATE task:bci_prepare_registry CONTENT {
  title: "Prepare Civil Registry Requirements",
  description: "Confirm the responsible registry office and gather parent identity evidence."
};
CREATE task:bci_find_registry_office CONTENT {
  title: "Identify Responsible Registry Office",
  description: "Confirm the office that serves the place of birth/residence before filing.",
  location: "Civil registration office with jurisdiction"
};
CREATE task:bci_parent_identity CONTENT {
  title: "Parent Identity Evidence",
  description: "Prepare accepted parent identity documents for registration.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" }
  ]
};

CREATE task:bci_submit_birth_registration CONTENT {
  title: "Submit Birth Registration",
  description: "Submit birth registration with supporting evidence and complete the official form."
};
CREATE task:bci_birth_notice_or_witness CONTENT {
  title: "Birth Notice or Witness Evidence",
  description: "Provide health-facility birth notice or accepted witness-based proof where applicable."
};
CREATE task:bci_fill_registration_form CONTENT {
  title: "Complete Registration Form",
  description: "Record names, dates, and parental details exactly before final submission."
};

CREATE task:bci_collect_certificate CONTENT {
  title: "Collect Birth Certificate",
  description: "Collect the issued certificate extract and verify key details."
};
CREATE task:bci_verify_certificate_details CONTENT {
  title: "Verify Certificate Details",
  description: "Verify name spelling, date of birth, and registry references."
};
CREATE task:bci_request_extra_copies CONTENT {
  title: "Request Additional Certified Copies",
  description: "Request extra certified copies for passport, school, and service workflows."
};

RELATE process:birth_certificate_issuance->requires->task:bci_prepare_registry SET sort_order = 1;
RELATE process:birth_certificate_issuance->requires->task:bci_submit_birth_registration SET sort_order = 2;
RELATE process:birth_certificate_issuance->requires->task:bci_collect_certificate SET sort_order = 3;

RELATE task:bci_prepare_registry->requires->task:bci_find_registry_office SET sort_order = 1;
RELATE task:bci_prepare_registry->requires->task:bci_parent_identity SET sort_order = 2;

RELATE task:bci_submit_birth_registration->requires->task:bci_birth_notice_or_witness SET sort_order = 1;
RELATE task:bci_submit_birth_registration->requires->task:bci_fill_registration_form SET sort_order = 2;

RELATE task:bci_collect_certificate->requires->task:bci_verify_certificate_details SET sort_order = 1;
RELATE task:bci_collect_certificate->requires->task:bci_request_extra_copies SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Marriage certificate registration tasks
-- Source: Civil registration agency service pages
-- ---------------------------------------------------------------------
CREATE task:mcr_prepare_documents CONTENT {
  title: "Prepare Marriage Registration Documents",
  description: "Prepare spouse identity, witness details, and any required supporting records."
};
CREATE task:mcr_spouse_identity CONTENT {
  title: "Spouse Identity Documents",
  description: "Prepare accepted identity documents for both spouses.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" }
  ]
};
CREATE task:mcr_witnesses CONTENT {
  title: "Witness Information",
  description: "Prepare witness names and identity details required by the registrar."
};

CREATE task:mcr_register_marriage CONTENT {
  title: "Register Marriage at Civil Office",
  description: "Appear in person, complete civil registration steps, and submit records.",
  location: "Civil registration marriage desk"
};
CREATE task:mcr_sign_and_pay CONTENT {
  title: "Sign Forms and Pay Fees",
  description: "Sign all required forms and pay applicable service fees."
};
CREATE task:mcr_registry_entry CONTENT {
  title: "Finalize Registry Entry",
  description: "Confirm the marriage entry is recorded in the civil registry log."
};

CREATE task:mcr_collect_certificate CONTENT {
  title: "Collect Marriage Certificate",
  description: "Collect certified marriage certificate after registration confirmation."
};
CREATE task:mcr_verify_details CONTENT {
  title: "Verify Certificate Details",
  description: "Verify spouse names, dates, and official registry references."
};
CREATE task:mcr_keep_certified_copies CONTENT {
  title: "Keep Certified Copies",
  description: "Store certified copies for immigration, residency, and legal-use workflows."
};

RELATE process:marriage_certificate_registration->requires->task:mcr_prepare_documents SET sort_order = 1;
RELATE process:marriage_certificate_registration->requires->task:mcr_register_marriage SET sort_order = 2;
RELATE process:marriage_certificate_registration->requires->task:mcr_collect_certificate SET sort_order = 3;

RELATE task:mcr_prepare_documents->requires->task:mcr_spouse_identity SET sort_order = 1;
RELATE task:mcr_prepare_documents->requires->task:mcr_witnesses SET sort_order = 2;

RELATE task:mcr_register_marriage->requires->task:mcr_sign_and_pay SET sort_order = 1;
RELATE task:mcr_register_marriage->requires->task:mcr_registry_entry SET sort_order = 2;

RELATE task:mcr_collect_certificate->requires->task:mcr_verify_details SET sort_order = 1;
RELATE task:mcr_collect_certificate->requires->task:mcr_keep_certified_copies SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Police clearance certificate tasks
-- Source: Federal Police public service channels
-- ---------------------------------------------------------------------
CREATE task:pcc_prepare_identity CONTENT {
  title: "Prepare Identity and References",
  description: "Prepare accepted identity document and any additional reference documents."
};
CREATE task:pcc_identity_document CONTENT {
  title: "Accepted Identity Document",
  description: "Prepare one accepted identification document for police clearance request.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" }
  ]
};
CREATE task:pcc_supporting_reference CONTENT {
  title: "Supporting Reference (If Requested)",
  description: "Prepare additional supporting records when requested by the clearance office."
};

CREATE task:pcc_submit_request CONTENT {
  title: "Submit Police Clearance Request",
  description: "Submit request form and complete identity verification/fingerprint capture.",
  location: "Police clearance service center",
  links: [
    { label: "Federal Police", url: "https://www.federalpolice.gov.et/" }
  ]
};
CREATE task:pcc_form_submission CONTENT {
  title: "Submit Application Form",
  description: "Submit complete form with contact and purpose-of-use details."
};
CREATE task:pcc_fingerprint_or_biometric CONTENT {
  title: "Fingerprint or Biometric Verification",
  description: "Complete biometric verification where required for certificate issuance."
};

CREATE task:pcc_collect_clearance CONTENT {
  title: "Collect Police Clearance Certificate",
  description: "Collect issued certificate and verify all identifying details."
};
CREATE task:pcc_verify_clearance CONTENT {
  title: "Verify Certificate Details",
  description: "Check personal details, issuance date, and reference number."
};
CREATE task:pcc_retain_clearance CONTENT {
  title: "Retain Certificate Copies",
  description: "Retain copies for employer, visa, and institutional requirements."
};

RELATE process:police_clearance_certificate->requires->task:pcc_prepare_identity SET sort_order = 1;
RELATE process:police_clearance_certificate->requires->task:pcc_submit_request SET sort_order = 2;
RELATE process:police_clearance_certificate->requires->task:pcc_collect_clearance SET sort_order = 3;

RELATE task:pcc_prepare_identity->requires->task:pcc_identity_document SET sort_order = 1;
RELATE task:pcc_prepare_identity->requires->task:pcc_supporting_reference SET sort_order = 2;

RELATE task:pcc_submit_request->requires->task:pcc_form_submission SET sort_order = 1;
RELATE task:pcc_submit_request->requires->task:pcc_fingerprint_or_biometric SET sort_order = 2;

RELATE task:pcc_collect_clearance->requires->task:pcc_verify_clearance SET sort_order = 1;
RELATE task:pcc_collect_clearance->requires->task:pcc_retain_clearance SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Work permit for foreign employee tasks
-- Source: Labor authority service channels
-- ---------------------------------------------------------------------
CREATE task:wpf_prepare_employer_docs CONTENT {
  title: "Prepare Employer Compliance Documents",
  description: "Prepare employer registration, licensing, and tax compliance documents."
};
CREATE task:wpf_business_compliance CONTENT {
  title: "Business Compliance Bundle",
  description: "Prepare business registration, trade license, and tax records.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Commercial Registration Certificate", process_key: "commercial_registration" },
    { name: "Trade License", process_key: "trade_license_new" },
    { name: "TIN", process_key: "tin_registration" }
  ]
};
CREATE task:wpf_justification_letter CONTENT {
  title: "Position Justification Letter",
  description: "Prepare employer letter explaining role, duration, and necessity."
};

CREATE task:wpf_prepare_employee_docs CONTENT {
  title: "Prepare Foreign Employee Documents",
  description: "Prepare passport and qualifications plus supporting employment records.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:wpf_employee_passport CONTENT {
  title: "Employee Passport Copy",
  description: "Prepare valid passport copy for the employee.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:wpf_qualification_records CONTENT {
  title: "Qualification and Experience Records",
  description: "Prepare education/professional evidence required for permit assessment."
};

CREATE task:wpf_submit_and_decision CONTENT {
  title: "Submit Work Permit and Track Decision",
  description: "Submit application, pay fees, and track official decision.",
  location: "Labor authority permit desk or approved digital filing channel",
  links: [
    { label: "Ministry of Labor and Skills", url: "https://www.mols.gov.et/" }
  ]
};
CREATE task:wpf_submit_application CONTENT {
  title: "Submit Permit Application",
  description: "Submit completed application package with all required attachments."
};
CREATE task:wpf_pay_and_track CONTENT {
  title: "Pay Fees and Track Status",
  description: "Pay applicable fees and track updates or correction requests."
};
CREATE task:wpf_receive_permit CONTENT {
  title: "Receive Work Permit",
  description: "Receive issued permit and verify employer, role, and validity details."
};

RELATE process:work_permit_foreign_employee->requires->task:wpf_prepare_employer_docs SET sort_order = 1;
RELATE process:work_permit_foreign_employee->requires->task:wpf_prepare_employee_docs SET sort_order = 2;
RELATE process:work_permit_foreign_employee->requires->task:wpf_submit_and_decision SET sort_order = 3;

RELATE task:wpf_prepare_employer_docs->requires->task:wpf_business_compliance SET sort_order = 1;
RELATE task:wpf_prepare_employer_docs->requires->task:wpf_justification_letter SET sort_order = 2;

RELATE task:wpf_prepare_employee_docs->requires->task:wpf_employee_passport SET sort_order = 1;
RELATE task:wpf_prepare_employee_docs->requires->task:wpf_qualification_records SET sort_order = 2;

RELATE task:wpf_submit_and_decision->requires->task:wpf_submit_application SET sort_order = 1;
RELATE task:wpf_submit_and_decision->requires->task:wpf_pay_and_track SET sort_order = 2;
RELATE task:wpf_submit_and_decision->requires->task:wpf_receive_permit SET sort_order = 3;

-- ---------------------------------------------------------------------
-- New electricity connection tasks
-- Source: Ethiopian Electric Utility service channels
-- ---------------------------------------------------------------------
CREATE task:enc_prepare_site_documents CONTENT {
  title: "Prepare Site and Identity Documents",
  description: "Prepare identity and property/tenancy evidence for the connection point."
};
CREATE task:enc_identity_or_tenancy CONTENT {
  title: "Identity and Occupancy Evidence",
  description: "Prepare identity plus occupancy evidence accepted for connection requests.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:enc_connection_point_details CONTENT {
  title: "Connection Point Details",
  description: "Prepare address, nearest pole/reference point, and wiring readiness details."
};

CREATE task:enc_submit_connection_request CONTENT {
  title: "Submit New Connection Request",
  description: "Submit connection request and complete site survey/quotation steps.",
  location: "EEU customer service office or approved digital channel",
  links: [
    { label: "Ethiopian Electric Utility", url: "https://www.eeu.gov.et/" }
  ]
};
CREATE task:enc_site_survey CONTENT {
  title: "Site Survey",
  description: "Complete utility site survey and technical feasibility assessment."
};
CREATE task:enc_quote_and_fee CONTENT {
  title: "Quotation and Fee Payment",
  description: "Accept connection quotation and pay required connection fees."
};

CREATE task:enc_install_and_activate CONTENT {
  title: "Install Meter and Activate Service",
  description: "Complete meter installation and activate the customer account."
};
CREATE task:enc_meter_installation CONTENT {
  title: "Meter Installation",
  description: "Ensure meter is installed and sealed according to utility standards."
};
CREATE task:enc_account_activation CONTENT {
  title: "Account Activation",
  description: "Activate billing account and confirm service availability."
};

RELATE process:electricity_new_connection->requires->task:enc_prepare_site_documents SET sort_order = 1;
RELATE process:electricity_new_connection->requires->task:enc_submit_connection_request SET sort_order = 2;
RELATE process:electricity_new_connection->requires->task:enc_install_and_activate SET sort_order = 3;

RELATE task:enc_prepare_site_documents->requires->task:enc_identity_or_tenancy SET sort_order = 1;
RELATE task:enc_prepare_site_documents->requires->task:enc_connection_point_details SET sort_order = 2;

RELATE task:enc_submit_connection_request->requires->task:enc_site_survey SET sort_order = 1;
RELATE task:enc_submit_connection_request->requires->task:enc_quote_and_fee SET sort_order = 2;

RELATE task:enc_install_and_activate->requires->task:enc_meter_installation SET sort_order = 1;
RELATE task:enc_install_and_activate->requires->task:enc_account_activation SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Death certificate issuance tasks
-- Source: civil registration authority flows
-- ---------------------------------------------------------------------
CREATE task:dc_confirm_event_details CONTENT {
  title: "Confirm Death Event Details",
  description: "Prepare death event information and required family/identity references."
};
CREATE task:dc_collect_medical_or_witness CONTENT {
  title: "Medical Notice or Witness Statement",
  description: "Prepare medical death notice where available or accepted witness statement.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Hospital Death Notice", process_key: "medical_death_notice" },
    { name: "Witness Statement", process_key: "witness_affidavit_notarization" }
  ]
};
CREATE task:dc_collect_family_identification CONTENT {
  title: "Family/Reporter Identification",
  description: "Prepare identification for person reporting the death event.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" }
  ]
};

CREATE task:dc_submit_registry_request CONTENT {
  title: "Submit Civil Registry Request",
  description: "Submit death registration request and supporting documents at civil registry.",
  location: "Civil registration office serving place of death/residence",
  links: [
    { label: "Civil Registration Services", url: "https://www.aacrrsa.gov.et/directorates/services/detail/7" }
  ]
};
CREATE task:dc_fill_death_form CONTENT {
  title: "Complete Death Registration Form",
  description: "Complete death registration form with accurate personal and event details."
};
CREATE task:dc_submit_supporting_documents CONTENT {
  title: "Submit Supporting Documents",
  description: "Submit identity, event evidence, and any additional required records."
};

CREATE task:dc_collect_certificate CONTENT {
  title: "Collect Death Certificate",
  description: "Collect certified extract and verify registry details."
};
CREATE task:dc_verify_record_extract CONTENT {
  title: "Verify Certificate Details",
  description: "Check names, dates, and location details before leaving service desk."
};
CREATE task:dc_request_additional_copies CONTENT {
  title: "Request Additional Copies",
  description: "Request extra certified copies for inheritance, pension, and legal use."
};

RELATE process:death_certificate_issuance->requires->task:dc_confirm_event_details SET sort_order = 1;
RELATE process:death_certificate_issuance->requires->task:dc_submit_registry_request SET sort_order = 2;
RELATE process:death_certificate_issuance->requires->task:dc_collect_certificate SET sort_order = 3;

RELATE task:dc_confirm_event_details->requires->task:dc_collect_medical_or_witness SET sort_order = 1;
RELATE task:dc_confirm_event_details->requires->task:dc_collect_family_identification SET sort_order = 2;

RELATE task:dc_submit_registry_request->requires->task:dc_fill_death_form SET sort_order = 1;
RELATE task:dc_submit_registry_request->requires->task:dc_submit_supporting_documents SET sort_order = 2;

RELATE task:dc_collect_certificate->requires->task:dc_verify_record_extract SET sort_order = 1;
RELATE task:dc_collect_certificate->requires->task:dc_request_additional_copies SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Divorce certificate registration tasks
-- Source: civil registration authority flows
-- ---------------------------------------------------------------------
CREATE task:dcr_prepare_case_documents CONTENT {
  title: "Prepare Divorce Case Documents",
  description: "Prepare civil records and identity documents needed for divorce registration."
};
CREATE task:dcr_marriage_record CONTENT {
  title: "Marriage Record",
  description: "Prepare marriage certificate/registry reference used to register divorce.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Marriage Certificate", process_key: "marriage_certificate_registration" }
  ]
};
CREATE task:dcr_identity_documents CONTENT {
  title: "Spouse Identification Documents",
  description: "Prepare accepted identification for each spouse/requesting party.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" }
  ]
};

CREATE task:dcr_file_divorce_record CONTENT {
  title: "File Divorce Registration",
  description: "Submit divorce evidence and complete registry entry procedures.",
  location: "Civil registration office where divorce is registered",
  links: [
    { label: "Civil Registration Services", url: "https://www.aacrrsa.gov.et/directorates/services/detail/7" }
  ]
};
CREATE task:dcr_submit_court_or_mutual_documents CONTENT {
  title: "Submit Court/Mutual Separation Evidence",
  description: "Submit finalized court judgment or accepted dissolution evidence."
};
CREATE task:dcr_register_registry_entry CONTENT {
  title: "Register Civil Status Update",
  description: "Confirm divorce status is entered in the civil registry."
};

CREATE task:dcr_collect_certificate CONTENT {
  title: "Collect Divorce Certificate",
  description: "Collect certified divorce record after registration is completed."
};
CREATE task:dcr_verify_certificate CONTENT {
  title: "Verify Certificate Details",
  description: "Verify names, dates, and case references on issued certificate."
};
CREATE task:dcr_request_certified_copies CONTENT {
  title: "Request Certified Copies",
  description: "Request additional certified copies for legal and administrative use."
};

RELATE process:divorce_certificate_registration->requires->task:dcr_prepare_case_documents SET sort_order = 1;
RELATE process:divorce_certificate_registration->requires->task:dcr_file_divorce_record SET sort_order = 2;
RELATE process:divorce_certificate_registration->requires->task:dcr_collect_certificate SET sort_order = 3;

RELATE task:dcr_prepare_case_documents->requires->task:dcr_marriage_record SET sort_order = 1;
RELATE task:dcr_prepare_case_documents->requires->task:dcr_identity_documents SET sort_order = 2;

RELATE task:dcr_file_divorce_record->requires->task:dcr_submit_court_or_mutual_documents SET sort_order = 1;
RELATE task:dcr_file_divorce_record->requires->task:dcr_register_registry_entry SET sort_order = 2;

RELATE task:dcr_collect_certificate->requires->task:dcr_verify_certificate SET sort_order = 1;
RELATE task:dcr_collect_certificate->requires->task:dcr_request_certified_copies SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Business name reservation tasks
-- Source: MoTRI / eTrade workflows
-- ---------------------------------------------------------------------
CREATE task:bnr_prepare_identity_and_activity CONTENT {
  title: "Prepare Applicant and Activity Details",
  description: "Prepare identity documents and intended business activity details."
};
CREATE task:bnr_applicant_identity CONTENT {
  title: "Applicant Identity",
  description: "Prepare accepted identity document for name reservation request.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Fayda ID / FIN", process_key: "fayda_registration" },
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:bnr_define_name_and_activity CONTENT {
  title: "Define Name and Activity",
  description: "Prepare preferred names and business activity category before submission."
};

CREATE task:bnr_submit_name_reservation CONTENT {
  title: "Submit Name Reservation Request",
  description: "Search availability and submit reservation application.",
  location: "eTrade portal or trade office support desk",
  links: [
    { label: "eTrade Portal", url: "https://etrade.gov.et" }
  ]
};
CREATE task:bnr_search_name_availability CONTENT {
  title: "Search Name Availability",
  description: "Search preferred names and choose available option."
};
CREATE task:bnr_pay_name_reservation_fee CONTENT {
  title: "Pay Reservation Fee",
  description: "Pay reservation fee and keep transaction reference."
};

CREATE task:bnr_receive_approval CONTENT {
  title: "Receive Reservation Confirmation",
  description: "Receive approval and keep reservation validity timeline."
};
CREATE task:bnr_download_reservation_letter CONTENT {
  title: "Download Reservation Letter",
  description: "Download/collect reservation confirmation for registration file."
};
CREATE task:bnr_use_before_expiry CONTENT {
  title: "Use Reservation Before Expiry",
  description: "Proceed to commercial registration before reservation expires.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Commercial Registration", process_key: "commercial_registration" }
  ]
};

RELATE process:business_name_reservation->requires->task:bnr_prepare_identity_and_activity SET sort_order = 1;
RELATE process:business_name_reservation->requires->task:bnr_submit_name_reservation SET sort_order = 2;
RELATE process:business_name_reservation->requires->task:bnr_receive_approval SET sort_order = 3;

RELATE task:bnr_prepare_identity_and_activity->requires->task:bnr_applicant_identity SET sort_order = 1;
RELATE task:bnr_prepare_identity_and_activity->requires->task:bnr_define_name_and_activity SET sort_order = 2;

RELATE task:bnr_submit_name_reservation->requires->task:bnr_search_name_availability SET sort_order = 1;
RELATE task:bnr_submit_name_reservation->requires->task:bnr_pay_name_reservation_fee SET sort_order = 2;

RELATE task:bnr_receive_approval->requires->task:bnr_download_reservation_letter SET sort_order = 1;
RELATE task:bnr_receive_approval->requires->task:bnr_use_before_expiry SET sort_order = 2;

-- ---------------------------------------------------------------------
-- VAT registration tasks
-- Source: Ministry of Revenues compliance flows
-- ---------------------------------------------------------------------
CREATE task:vat_confirm_eligibility CONTENT {
  title: "Confirm VAT Registration Eligibility",
  description: "Confirm VAT threshold/mandatory conditions before filing."
};
CREATE task:vat_check_turnover_threshold CONTENT {
  title: "Check Turnover and Mandatory Criteria",
  description: "Confirm whether threshold or activity type requires VAT registration."
};
CREATE task:vat_prepare_business_identifiers CONTENT {
  title: "Prepare TIN and Business Documents",
  description: "Prepare taxpayer and business identification records.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "TIN", process_key: "tin_registration" },
    { name: "Trade License", process_key: "trade_license_new" }
  ]
};

CREATE task:vat_submit_registration CONTENT {
  title: "Submit VAT Registration",
  description: "Submit VAT registration form with supporting business records.",
  location: "Ministry of Revenues office or online filing channel",
  links: [
    { label: "Ministry of Revenues", url: "https://www.mor.gov.et/web/mor/mor" },
    { label: "Ethiopian Business Portal", url: "https://www.new.business.gov.et/" }
  ]
};
CREATE task:vat_complete_vat_form CONTENT {
  title: "Complete VAT Form",
  description: "Fill VAT registration form with business and contact details."
};
CREATE task:vat_attach_supporting_documents CONTENT {
  title: "Attach Supporting Documents",
  description: "Attach required registration, licensing, and taxpayer documents."
};

CREATE task:vat_activate_vat_compliance CONTENT {
  title: "Activate VAT Compliance",
  description: "Receive confirmation and start periodic VAT filing obligations."
};
CREATE task:vat_get_vat_certificate CONTENT {
  title: "Receive VAT Confirmation",
  description: "Collect VAT registration certificate/confirmation details."
};
CREATE task:vat_set_filing_calendar CONTENT {
  title: "Set Filing and Record Calendar",
  description: "Set internal filing deadlines and bookkeeping controls for VAT returns."
};

RELATE process:vat_registration->requires->task:vat_confirm_eligibility SET sort_order = 1;
RELATE process:vat_registration->requires->task:vat_submit_registration SET sort_order = 2;
RELATE process:vat_registration->requires->task:vat_activate_vat_compliance SET sort_order = 3;

RELATE task:vat_confirm_eligibility->requires->task:vat_check_turnover_threshold SET sort_order = 1;
RELATE task:vat_confirm_eligibility->requires->task:vat_prepare_business_identifiers SET sort_order = 2;

RELATE task:vat_submit_registration->requires->task:vat_complete_vat_form SET sort_order = 1;
RELATE task:vat_submit_registration->requires->task:vat_attach_supporting_documents SET sort_order = 2;

RELATE task:vat_activate_vat_compliance->requires->task:vat_get_vat_certificate SET sort_order = 1;
RELATE task:vat_activate_vat_compliance->requires->task:vat_set_filing_calendar SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Importer / exporter code registration tasks
-- Source: trade/tax integrated business workflows
-- ---------------------------------------------------------------------
CREATE task:iec_prepare_prerequisites CONTENT {
  title: "Prepare Trade and Tax Prerequisites",
  description: "Complete registration, licensing, and tax prerequisites before applying."
};
CREATE task:iec_commercial_and_trade_docs CONTENT {
  title: "Commercial Registration and Trade License",
  description: "Prepare core business legality documents.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Commercial Registration", process_key: "commercial_registration" },
    { name: "Trade License", process_key: "trade_license_new" }
  ]
};
CREATE task:iec_tax_identification CONTENT {
  title: "Tax Registration Evidence",
  description: "Prepare tax registration identifiers used for code issuance.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "TIN", process_key: "tin_registration" }
  ]
};

CREATE task:iec_submit_application CONTENT {
  title: "Submit Importer/Exporter Application",
  description: "Submit application and pay service fees through approved channel.",
  location: "Trade/revenue service office or approved online portal",
  links: [
    { label: "eTrade Portal", url: "https://etrade.gov.et" },
    { label: "Ethiopian Business Portal", url: "https://www.new.business.gov.et/" }
  ]
};
CREATE task:iec_fill_import_export_form CONTENT {
  title: "Complete Application Form",
  description: "Fill importer/exporter registration form with business details."
};
CREATE task:iec_pay_service_fees CONTENT {
  title: "Pay Service Fees",
  description: "Pay registration/service fees and keep official receipt."
};

CREATE task:iec_receive_code CONTENT {
  title: "Receive Importer/Exporter Code",
  description: "Receive issued code and verify company details."
};
CREATE task:iec_collect_certificate_or_code CONTENT {
  title: "Collect Registration Output",
  description: "Collect code/certificate from portal or service desk."
};
CREATE task:iec_link_with_bank_and_customs CONTENT {
  title: "Link Code in Operations",
  description: "Use issued code in customs declarations and trade banking operations."
};

RELATE process:import_export_code_registration->requires->task:iec_prepare_prerequisites SET sort_order = 1;
RELATE process:import_export_code_registration->requires->task:iec_submit_application SET sort_order = 2;
RELATE process:import_export_code_registration->requires->task:iec_receive_code SET sort_order = 3;

RELATE task:iec_prepare_prerequisites->requires->task:iec_commercial_and_trade_docs SET sort_order = 1;
RELATE task:iec_prepare_prerequisites->requires->task:iec_tax_identification SET sort_order = 2;

RELATE task:iec_submit_application->requires->task:iec_fill_import_export_form SET sort_order = 1;
RELATE task:iec_submit_application->requires->task:iec_pay_service_fees SET sort_order = 2;

RELATE task:iec_receive_code->requires->task:iec_collect_certificate_or_code SET sort_order = 1;
RELATE task:iec_receive_code->requires->task:iec_link_with_bank_and_customs SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Building construction permit tasks
-- Source: city/regional permit authority workflows
-- ---------------------------------------------------------------------
CREATE task:bcp_prepare_land_and_design_documents CONTENT {
  title: "Prepare Land and Design Documents",
  description: "Prepare land-right and building design documents for permit filing."
};
CREATE task:bcp_proof_of_plot_or_lease CONTENT {
  title: "Land Plot / Lease Evidence",
  description: "Prepare accepted land ownership/lease and site evidence.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Land Holding Certificate", process_key: "land_holding_certificate_issuance" }
  ]
};
CREATE task:bcp_architectural_drawings CONTENT {
  title: "Architectural and Structural Drawings",
  description: "Prepare plan set required for technical review."
};

CREATE task:bcp_submit_permit_application CONTENT {
  title: "Submit Construction Permit Application",
  description: "Submit permit package and address technical review comments.",
  location: "City/regional construction permit authority",
  links: [
    { label: "Addis Permit and Control", url: "https://www.aacpco.gov.et/" }
  ]
};
CREATE task:bcp_file_application_package CONTENT {
  title: "File Permit Package",
  description: "Submit complete package, references, and contact information."
};
CREATE task:bcp_technical_review_and_corrections CONTENT {
  title: "Technical Review and Corrections",
  description: "Address plan corrections requested during technical review."
};

CREATE task:bcp_receive_permit_and_inspection_plan CONTENT {
  title: "Receive Permit and Inspection Path",
  description: "Collect permit and comply with staged inspection checkpoints."
};
CREATE task:bcp_collect_permit_document CONTENT {
  title: "Collect Permit Document",
  description: "Collect approved permit and verify conditions/validity period."
};
CREATE task:bcp_schedule_stage_inspections CONTENT {
  title: "Schedule Stage Inspections",
  description: "Schedule required inspections for foundation, structure, and completion."
};

RELATE process:building_construction_permit->requires->task:bcp_prepare_land_and_design_documents SET sort_order = 1;
RELATE process:building_construction_permit->requires->task:bcp_submit_permit_application SET sort_order = 2;
RELATE process:building_construction_permit->requires->task:bcp_receive_permit_and_inspection_plan SET sort_order = 3;

RELATE task:bcp_prepare_land_and_design_documents->requires->task:bcp_proof_of_plot_or_lease SET sort_order = 1;
RELATE task:bcp_prepare_land_and_design_documents->requires->task:bcp_architectural_drawings SET sort_order = 2;

RELATE task:bcp_submit_permit_application->requires->task:bcp_file_application_package SET sort_order = 1;
RELATE task:bcp_submit_permit_application->requires->task:bcp_technical_review_and_corrections SET sort_order = 2;

RELATE task:bcp_receive_permit_and_inspection_plan->requires->task:bcp_collect_permit_document SET sort_order = 1;
RELATE task:bcp_receive_permit_and_inspection_plan->requires->task:bcp_schedule_stage_inspections SET sort_order = 2;

-- ---------------------------------------------------------------------
-- New water connection tasks
-- Source: city water utility workflows
-- ---------------------------------------------------------------------
CREATE task:wnc_prepare_site_documents CONTENT {
  title: "Prepare Site and Customer Documents",
  description: "Prepare identity and occupancy records for the connection site."
};
CREATE task:wnc_identity_or_tenancy CONTENT {
  title: "Identity and Occupancy Evidence",
  description: "Prepare accepted identity and tenancy/ownership evidence.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:wnc_connection_point_information CONTENT {
  title: "Connection Point Information",
  description: "Prepare full address and site access details for utility survey."
};

CREATE task:wnc_submit_connection_request CONTENT {
  title: "Submit Water Connection Request",
  description: "Submit application and complete utility review steps.",
  location: "Water utility customer service office or approved digital channel",
  links: [
    { label: "Addis Ababa Water and Sewerage Authority", url: "https://www.aawsa.gov.et/" }
  ]
};
CREATE task:wnc_site_survey CONTENT {
  title: "Site Survey",
  description: "Complete technical survey and feasibility review."
};
CREATE task:wnc_quote_and_fee CONTENT {
  title: "Quotation and Fee Settlement",
  description: "Approve quotation and pay required connection charges."
};

CREATE task:wnc_install_and_activate CONTENT {
  title: "Install Meter and Activate Account",
  description: "Complete meter installation and activate utility account."
};
CREATE task:wnc_meter_installation CONTENT {
  title: "Meter Installation",
  description: "Confirm meter installation and sealing by utility team."
};
CREATE task:wnc_service_activation CONTENT {
  title: "Service Activation",
  description: "Confirm account activation and initial billing setup."
};

RELATE process:water_new_connection->requires->task:wnc_prepare_site_documents SET sort_order = 1;
RELATE process:water_new_connection->requires->task:wnc_submit_connection_request SET sort_order = 2;
RELATE process:water_new_connection->requires->task:wnc_install_and_activate SET sort_order = 3;

RELATE task:wnc_prepare_site_documents->requires->task:wnc_identity_or_tenancy SET sort_order = 1;
RELATE task:wnc_prepare_site_documents->requires->task:wnc_connection_point_information SET sort_order = 2;

RELATE task:wnc_submit_connection_request->requires->task:wnc_site_survey SET sort_order = 1;
RELATE task:wnc_submit_connection_request->requires->task:wnc_quote_and_fee SET sort_order = 2;

RELATE task:wnc_install_and_activate->requires->task:wnc_meter_installation SET sort_order = 1;
RELATE task:wnc_install_and_activate->requires->task:wnc_service_activation SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Vehicle ownership transfer tasks
-- Source: transport authority workflows
-- ---------------------------------------------------------------------
CREATE task:vot_prepare_transfer_documents CONTENT {
  title: "Prepare Ownership Transfer Documents",
  description: "Prepare seller/buyer IDs and vehicle transfer evidence."
};
CREATE task:vot_identity_and_license CONTENT {
  title: "Identity and License Documents",
  description: "Prepare accepted identity and driving credentials for parties.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Passport", process_key: "passport" },
    { name: "Driver License", process_key: "drivers_license_issue" }
  ]
};
CREATE task:vot_sale_agreement_and_vehicle_docs CONTENT {
  title: "Sale Agreement and Vehicle File",
  description: "Prepare sale agreement, existing ownership book, and vehicle documents."
};

CREATE task:vot_submit_transfer_request CONTENT {
  title: "Submit Transfer Request",
  description: "Submit transfer request, complete inspection/clearance, and pay fees.",
  location: "Driver and Vehicle License Control Authority branch",
  links: [
    { label: "DVLCA", url: "https://www.dvlca.gov.et/" }
  ]
};
CREATE task:vot_vehicle_inspection_and_clearance CONTENT {
  title: "Vehicle Inspection and Clearance",
  description: "Complete required vehicle inspection and clearance checks."
};
CREATE task:vot_pay_transfer_fees_and_stamp CONTENT {
  title: "Pay Transfer Fees",
  description: "Pay transfer and stamping fees and keep official receipt."
};

CREATE task:vot_receive_updated_ownership CONTENT {
  title: "Receive Updated Ownership Record",
  description: "Collect updated ownership document and validate all details."
};
CREATE task:vot_collect_updated_book_or_card CONTENT {
  title: "Collect Updated Book/Card",
  description: "Collect new ownership book/card in buyer's name."
};
CREATE task:vot_update_insurance_and_records CONTENT {
  title: "Update Insurance and Related Records",
  description: "Update insurance, inspection, and related records after transfer."
};

RELATE process:vehicle_ownership_transfer->requires->task:vot_prepare_transfer_documents SET sort_order = 1;
RELATE process:vehicle_ownership_transfer->requires->task:vot_submit_transfer_request SET sort_order = 2;
RELATE process:vehicle_ownership_transfer->requires->task:vot_receive_updated_ownership SET sort_order = 3;

RELATE task:vot_prepare_transfer_documents->requires->task:vot_identity_and_license SET sort_order = 1;
RELATE task:vot_prepare_transfer_documents->requires->task:vot_sale_agreement_and_vehicle_docs SET sort_order = 2;

RELATE task:vot_submit_transfer_request->requires->task:vot_vehicle_inspection_and_clearance SET sort_order = 1;
RELATE task:vot_submit_transfer_request->requires->task:vot_pay_transfer_fees_and_stamp SET sort_order = 2;

RELATE task:vot_receive_updated_ownership->requires->task:vot_collect_updated_book_or_card SET sort_order = 1;
RELATE task:vot_receive_updated_ownership->requires->task:vot_update_insurance_and_records SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Land holding certificate issuance tasks
-- ---------------------------------------------------------------------
CREATE task:lhc_prepare_core_documents CONTENT {
  title: "Prepare Core Land and Identity Documents",
  description: "Prepare applicant identity and legal basis documents for land holding certificate issuance."
};
CREATE task:lhc_identity_and_residency_docs CONTENT {
  title: "Identity and Residency Documents",
  description: "Prepare accepted identity and residency documents for applicant verification.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:lhc_acquisition_basis_docs CONTENT {
  title: "Land Acquisition Basis Documents",
  description: "Prepare legal basis for holding claim (lease allocation, transfer contract, or decision records)."
};

CREATE task:lhc_submit_land_record_request CONTENT {
  title: "Submit Land Record Request",
  description: "Open application file and complete parcel record verification steps.",
  location: "Land administration and information service office",
  links: [
    { label: "Addis Ababa City Administration", url: "https://www.aaca.gov.et/" }
  ]
};
CREATE task:lhc_open_application_file CONTENT {
  title: "Open Application File",
  description: "File issuance request with parcel references and applicant details."
};
CREATE task:lhc_parcel_record_verification CONTENT {
  title: "Parcel and Boundary Verification",
  description: "Verify parcel information using survey/cadastre references.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Cadastral Map and Boundary Certificate", process_key: "cadastral_map_and_boundary_certificate" }
  ]
};

CREATE task:lhc_receive_certificate CONTENT {
  title: "Receive Land Holding Certificate",
  description: "Pay service fees and collect issued certificate/registry extract."
};
CREATE task:lhc_pay_certificate_fees CONTENT {
  title: "Pay Certificate Fees",
  description: "Pay official service fees and keep receipt in your property file."
};
CREATE task:lhc_collect_and_verify_certificate CONTENT {
  title: "Collect and Verify Certificate",
  description: "Collect certificate and verify owner name, parcel, and reference details."
};

RELATE process:land_holding_certificate_issuance->requires->task:lhc_prepare_core_documents SET sort_order = 1;
RELATE process:land_holding_certificate_issuance->requires->task:lhc_submit_land_record_request SET sort_order = 2;
RELATE process:land_holding_certificate_issuance->requires->task:lhc_receive_certificate SET sort_order = 3;

RELATE task:lhc_prepare_core_documents->requires->task:lhc_identity_and_residency_docs SET sort_order = 1;
RELATE task:lhc_prepare_core_documents->requires->task:lhc_acquisition_basis_docs SET sort_order = 2;

RELATE task:lhc_submit_land_record_request->requires->task:lhc_open_application_file SET sort_order = 1;
RELATE task:lhc_submit_land_record_request->requires->task:lhc_parcel_record_verification SET sort_order = 2;

RELATE task:lhc_receive_certificate->requires->task:lhc_pay_certificate_fees SET sort_order = 1;
RELATE task:lhc_receive_certificate->requires->task:lhc_collect_and_verify_certificate SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Land lease / holding transfer tasks
-- ---------------------------------------------------------------------
CREATE task:llt_prepare_transfer_pack CONTENT {
  title: "Prepare Transfer Document Pack",
  description: "Prepare seller/buyer identity records and existing land holding evidence."
};
CREATE task:llt_transferor_and_transferee_ids CONTENT {
  title: "Transferor and Transferee IDs",
  description: "Prepare accepted identification for both parties.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:llt_existing_land_holding_record CONTENT {
  title: "Existing Land Holding Record",
  description: "Prepare valid current land holding certificate and parcel references.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Land Holding Certificate", process_key: "land_holding_certificate_issuance" }
  ]
};

CREATE task:llt_clear_compliance_and_taxes CONTENT {
  title: "Clear Compliance and Taxes",
  description: "Clear tax/dues and confirm transfer compliance before filing."
};
CREATE task:llt_tax_clearance CONTENT {
  title: "Tax Clearance",
  description: "Obtain or confirm tax clearance where required for transfer filing.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "TIN", process_key: "tin_registration" }
  ]
};
CREATE task:llt_municipal_dues_clearance CONTENT {
  title: "Municipal Dues Clearance",
  description: "Clear municipal obligations linked to the parcel/property."
};

CREATE task:llt_submit_transfer_and_register CONTENT {
  title: "Submit Transfer and Register",
  description: "Submit transfer package and receive updated holding record.",
  location: "Land transfer and registry desk",
  links: [
    { label: "Addis Ababa City Administration", url: "https://www.aaca.gov.et/" }
  ]
};
CREATE task:llt_file_transfer_application CONTENT {
  title: "File Transfer Application",
  description: "Submit signed transfer package and complete registry checks."
};
CREATE task:llt_receive_updated_lease_record CONTENT {
  title: "Receive Updated Lease/Holding Record",
  description: "Collect updated holder record and verify parcel and holder details."
};

RELATE process:land_lease_transfer->requires->task:llt_prepare_transfer_pack SET sort_order = 1;
RELATE process:land_lease_transfer->requires->task:llt_clear_compliance_and_taxes SET sort_order = 2;
RELATE process:land_lease_transfer->requires->task:llt_submit_transfer_and_register SET sort_order = 3;

RELATE task:llt_prepare_transfer_pack->requires->task:llt_transferor_and_transferee_ids SET sort_order = 1;
RELATE task:llt_prepare_transfer_pack->requires->task:llt_existing_land_holding_record SET sort_order = 2;

RELATE task:llt_clear_compliance_and_taxes->requires->task:llt_tax_clearance SET sort_order = 1;
RELATE task:llt_clear_compliance_and_taxes->requires->task:llt_municipal_dues_clearance SET sort_order = 2;

RELATE task:llt_submit_transfer_and_register->requires->task:llt_file_transfer_application SET sort_order = 1;
RELATE task:llt_submit_transfer_and_register->requires->task:llt_receive_updated_lease_record SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Cadastral map and boundary certificate tasks
-- ---------------------------------------------------------------------
CREATE task:cmb_prepare_site_information CONTENT {
  title: "Prepare Site and Applicant Information",
  description: "Prepare parcel references and applicant identity records for cadastre request."
};
CREATE task:cmb_parcel_reference_details CONTENT {
  title: "Parcel Reference Details",
  description: "Prepare parcel references and existing records used by survey team.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Land Holding Certificate", process_key: "land_holding_certificate_issuance" }
  ]
};
CREATE task:cmb_identity_docs CONTENT {
  title: "Applicant Identity Documents",
  description: "Prepare accepted identity documentation for the request.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" },
    { name: "Passport", process_key: "passport" }
  ]
};

CREATE task:cmb_request_survey_and_mapping CONTENT {
  title: "Request Survey and Mapping",
  description: "Submit request, complete field survey, and boundary witness confirmations.",
  location: "Land survey/cadastre service office",
  links: [
    { label: "Addis Ababa City Administration", url: "https://www.aaca.gov.et/" }
  ]
};
CREATE task:cmb_schedule_field_survey CONTENT {
  title: "Schedule Field Survey",
  description: "Coordinate site visit timeline for cadastral survey team."
};
CREATE task:cmb_boundary_witness_confirmation CONTENT {
  title: "Boundary Witness Confirmation",
  description: "Complete boundary witness confirmation where required."
};

CREATE task:cmb_collect_cadastral_output CONTENT {
  title: "Collect Cadastral Output",
  description: "Collect certified map and verify coordinates/boundary details."
};
CREATE task:cmb_review_map_coordinates CONTENT {
  title: "Review Map Coordinates",
  description: "Check coordinates, parcel identifiers, and boundary references."
};
CREATE task:cmb_collect_certified_map CONTENT {
  title: "Collect Certified Cadastral Map",
  description: "Collect final certified map output for use in related processes."
};

RELATE process:cadastral_map_and_boundary_certificate->requires->task:cmb_prepare_site_information SET sort_order = 1;
RELATE process:cadastral_map_and_boundary_certificate->requires->task:cmb_request_survey_and_mapping SET sort_order = 2;
RELATE process:cadastral_map_and_boundary_certificate->requires->task:cmb_collect_cadastral_output SET sort_order = 3;

RELATE task:cmb_prepare_site_information->requires->task:cmb_parcel_reference_details SET sort_order = 1;
RELATE task:cmb_prepare_site_information->requires->task:cmb_identity_docs SET sort_order = 2;

RELATE task:cmb_request_survey_and_mapping->requires->task:cmb_schedule_field_survey SET sort_order = 1;
RELATE task:cmb_request_survey_and_mapping->requires->task:cmb_boundary_witness_confirmation SET sort_order = 2;

RELATE task:cmb_collect_cadastral_output->requires->task:cmb_review_map_coordinates SET sort_order = 1;
RELATE task:cmb_collect_cadastral_output->requires->task:cmb_collect_certified_map SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Property mortgage registration tasks
-- ---------------------------------------------------------------------
CREATE task:pmr_prepare_loan_and_property_documents CONTENT {
  title: "Prepare Loan and Property Documents",
  description: "Prepare property records and lender/borrower documents for mortgage registration."
};
CREATE task:pmr_property_title_or_holding_record CONTENT {
  title: "Property Title/Holding Record",
  description: "Prepare valid property/land record used for mortgage registration.",
  required_documents_mode: "all_of",
  required_documents: [
    { name: "Land Holding Certificate", process_key: "land_holding_certificate_issuance" }
  ]
};
CREATE task:pmr_lender_and_borrower_documents CONTENT {
  title: "Lender and Borrower Identification",
  description: "Prepare accepted identification for lender/borrower parties.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" },
    { name: "Passport", process_key: "passport" }
  ]
};

CREATE task:pmr_file_encumbrance_registration CONTENT {
  title: "File Encumbrance Registration",
  description: "Submit mortgage deed and complete registry/legal review checks.",
  location: "Land registry encumbrance service desk",
  links: [
    { label: "Addis Ababa City Administration", url: "https://www.aaca.gov.et/" }
  ]
};
CREATE task:pmr_submit_mortgage_deed CONTENT {
  title: "Submit Mortgage Deed",
  description: "Submit signed mortgage deed and supporting legal file."
};
CREATE task:pmr_registry_review_and_stamp CONTENT {
  title: "Registry Review and Stamping",
  description: "Complete review, stamping, and registry entry procedures."
};

CREATE task:pmr_collect_registration_output CONTENT {
  title: "Collect Registration Output",
  description: "Collect encumbrance confirmation and update related records."
};
CREATE task:pmr_collect_encumbrance_certificate CONTENT {
  title: "Collect Encumbrance Confirmation",
  description: "Collect registered mortgage confirmation/certificate details."
};
CREATE task:pmr_update_related_records CONTENT {
  title: "Update Related Property Records",
  description: "Update bank, insurance, and internal property records after registration."
};

RELATE process:property_mortgage_registration->requires->task:pmr_prepare_loan_and_property_documents SET sort_order = 1;
RELATE process:property_mortgage_registration->requires->task:pmr_file_encumbrance_registration SET sort_order = 2;
RELATE process:property_mortgage_registration->requires->task:pmr_collect_registration_output SET sort_order = 3;

RELATE task:pmr_prepare_loan_and_property_documents->requires->task:pmr_property_title_or_holding_record SET sort_order = 1;
RELATE task:pmr_prepare_loan_and_property_documents->requires->task:pmr_lender_and_borrower_documents SET sort_order = 2;

RELATE task:pmr_file_encumbrance_registration->requires->task:pmr_submit_mortgage_deed SET sort_order = 1;
RELATE task:pmr_file_encumbrance_registration->requires->task:pmr_registry_review_and_stamp SET sort_order = 2;

RELATE task:pmr_collect_registration_output->requires->task:pmr_collect_encumbrance_certificate SET sort_order = 1;
RELATE task:pmr_collect_registration_output->requires->task:pmr_update_related_records SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Medical death notice issuance tasks
-- ---------------------------------------------------------------------
CREATE task:mdn_prepare_request_context CONTENT {
  title: "Prepare Request Context",
  description: "Prepare requester identity and death-event context required by the health facility."
};
CREATE task:mdn_requester_identity CONTENT {
  title: "Requester Identification",
  description: "Prepare accepted identification for requester/family representative.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:mdn_case_information CONTENT {
  title: "Death Case Information",
  description: "Prepare case details used by facility to verify and issue notice."
};

CREATE task:mdn_submit_facility_request CONTENT {
  title: "Submit Health Facility Request",
  description: "Submit notice request and complete verification steps at issuing facility.",
  location: "Hospital or health facility records desk",
  links: [
    { label: "Ministry of Health", url: "https://www.moh.gov.et/" }
  ]
};
CREATE task:mdn_file_notice_request CONTENT {
  title: "File Notice Request",
  description: "Submit request with required records to the facility records unit."
};
CREATE task:mdn_complete_clinical_verification CONTENT {
  title: "Clinical/Registry Verification",
  description: "Complete verification process required by the facility prior to issuance."
};

CREATE task:mdn_collect_notice CONTENT {
  title: "Collect Medical Death Notice",
  description: "Collect signed notice and verify names, dates, and facility details."
};
CREATE task:mdn_receive_signed_notice CONTENT {
  title: "Receive Signed Notice",
  description: "Collect issued notice with official signature/stamp."
};
CREATE task:mdn_verify_notice_details CONTENT {
  title: "Verify Notice Details",
  description: "Verify personal details and event information before leaving."
};

RELATE process:medical_death_notice->requires->task:mdn_prepare_request_context SET sort_order = 1;
RELATE process:medical_death_notice->requires->task:mdn_submit_facility_request SET sort_order = 2;
RELATE process:medical_death_notice->requires->task:mdn_collect_notice SET sort_order = 3;

RELATE task:mdn_prepare_request_context->requires->task:mdn_requester_identity SET sort_order = 1;
RELATE task:mdn_prepare_request_context->requires->task:mdn_case_information SET sort_order = 2;

RELATE task:mdn_submit_facility_request->requires->task:mdn_file_notice_request SET sort_order = 1;
RELATE task:mdn_submit_facility_request->requires->task:mdn_complete_clinical_verification SET sort_order = 2;

RELATE task:mdn_collect_notice->requires->task:mdn_receive_signed_notice SET sort_order = 1;
RELATE task:mdn_collect_notice->requires->task:mdn_verify_notice_details SET sort_order = 2;

-- ---------------------------------------------------------------------
-- Witness statement / affidavit notarization tasks
-- ---------------------------------------------------------------------
CREATE task:wan_prepare_affidavit_pack CONTENT {
  title: "Prepare Affidavit Package",
  description: "Prepare witness identity and the statement draft to be notarized."
};
CREATE task:wan_witness_identity_documents CONTENT {
  title: "Witness Identity Documents",
  description: "Prepare accepted witness identification documents.",
  required_documents_mode: "one_of",
  required_documents: [
    { name: "Kebele ID", process_key: "kebele_id_residency" },
    { name: "Fayda ID / FIN", process_key: "fayda_registration" },
    { name: "Passport", process_key: "passport" }
  ]
};
CREATE task:wan_statement_draft CONTENT {
  title: "Statement Draft",
  description: "Prepare complete witness statement draft for formal review."
};

CREATE task:wan_appear_before_authority CONTENT {
  title: "Appear Before Notary/Authority",
  description: "Appear in person for identity verification and sworn signing.",
  location: "Notary/document authentication office or competent legal authority",
  links: [
    { label: "Ministry of Justice", url: "https://moj.gov.et/" }
  ]
};
CREATE task:wan_identity_verification CONTENT {
  title: "Identity Verification",
  description: "Complete witness identity verification before notarization."
};
CREATE task:wan_sign_in_presence CONTENT {
  title: "Sign in Presence of Officer",
  description: "Sign statement in the presence of authorized officer/notary."
};

CREATE task:wan_collect_notarized_output CONTENT {
  title: "Collect Notarized Output",
  description: "Pay fees and collect notarized affidavit/statement."
};
CREATE task:wan_pay_notary_fees CONTENT {
  title: "Pay Notary/Service Fees",
  description: "Pay applicable fees and keep official receipt."
};
CREATE task:wan_verify_notarization_details CONTENT {
  title: "Verify Notarization Details",
  description: "Verify stamp, signature, date, and witness details on final document."
};

RELATE process:witness_affidavit_notarization->requires->task:wan_prepare_affidavit_pack SET sort_order = 1;
RELATE process:witness_affidavit_notarization->requires->task:wan_appear_before_authority SET sort_order = 2;
RELATE process:witness_affidavit_notarization->requires->task:wan_collect_notarized_output SET sort_order = 3;

RELATE task:wan_prepare_affidavit_pack->requires->task:wan_witness_identity_documents SET sort_order = 1;
RELATE task:wan_prepare_affidavit_pack->requires->task:wan_statement_draft SET sort_order = 2;

RELATE task:wan_appear_before_authority->requires->task:wan_identity_verification SET sort_order = 1;
RELATE task:wan_appear_before_authority->requires->task:wan_sign_in_presence SET sort_order = 2;

RELATE task:wan_collect_notarized_output->requires->task:wan_pay_notary_fees SET sort_order = 1;
RELATE task:wan_collect_notarized_output->requires->task:wan_verify_notarization_details SET sort_order = 2;

COMMIT TRANSACTION;
