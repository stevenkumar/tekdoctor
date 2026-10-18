# India States and Districts Dataset

## Overview
This directory contains `indiaStatesDistricts.json`, a maintainable, local JSON dataset mapping all 28 Indian States and 8 Union Territories (36 total) to their officially recognized administrative districts.

This dataset is used by:
1. **Frontend**: `client/src/pages/repair/RepairInquiryForm.tsx` — powers the dynamic State-to-District dropdown and validates PIN-code lookup location matches.
2. **Backend**: `server/data/indiaStatesDistricts.json` & `server/middleware/validate.middleware.js` — validates that a submitted District/City belongs strictly to the selected State/UT.

---

## Data Source & Verification
- **Primary Source**: [Local Government Directory (LGD)](https://lgd.gov.in/), Ministry of Panchayati Raj, Government of India.
- **Secondary Source**: [Know India: National Portal of India](https://knowindia.india.gov.in/), National Informatics Centre (NIC).
- **Last Verified Date**: October 2026
- **Total States & UTs**: 36 (28 States + 8 Union Territories)
- **Key State Counts**:
  - **Uttar Pradesh**: 75 districts (all verified)
  - **Madhya Pradesh**: 55 districts (including Maihar, Mauganj, Pandhurna)
  - **Rajasthan**: 50 districts (including newly organized districts such as Anupgarh, Balotra, Beawar, Deeg, Didwana-Kuchaman, Dudu, Gangapur City, Jaipur Rural, Jodhpur Rural, Kekri, Khairthal-Tijara, Kotputli-Behror, Neem Ka Thana, Phalodi, Salumbar, Sanchore, Shahpura)
  - **Tamil Nadu**: 38 districts
  - **Bihar**: 38 districts
  - **Maharashtra**: 36 districts (including Chhatrapati Sambhajinagar, Dharashiv, Ahilyanagar)
  - **Gujarat**: 33 districts
  - **Telangana**: 33 districts
  - **Chhattisgarh**: 33 districts
  - **Karnataka**: 31 districts (including Vijayanagara)
  - **Odisha**: 30 districts
  - **Andhra Pradesh**: 26 districts (post-2022 reorganization)
  - **Arunachal Pradesh**: 26 districts
  - **Jharkhand**: 24 districts
  - **Punjab**: 23 districts (including Malerkotla)
  - **West Bengal**: 23 districts
  - **Haryana**: 22 districts
  - **Jammu and Kashmir (UT)**: 20 districts
  - **Manipur**: 16 districts
  - **Nagaland**: 16 districts
  - **Kerala**: 14 districts
  - **Uttarakhand**: 13 districts
  - **Himachal Pradesh**: 12 districts
  - **Meghalaya**: 12 districts
  - **Delhi (NCT)**: 11 districts
  - **Mizoram**: 11 districts
  - **Tripura**: 8 districts
  - **Sikkim**: 6 districts
  - **Puducherry (UT)**: 4 districts
  - **Andaman and Nicobar Islands (UT)**: 3 districts
  - **Dadra and Nagar Haveli and Daman and Diu (UT)**: 3 districts
  - **Goa**: 2 districts
  - **Ladakh (UT)**: 2 districts
  - **Chandigarh (UT)**: 1 district
  - **Lakshadweep (UT)**: 1 district

---

## Manual Dataset Maintenance Procedure

When a district is reorganized, created, renamed, or transferred by a State Government / Ministry of Home Affairs:

1. **Edit the Client Dataset**:
   - Open `client/src/data/indiaStatesDistricts.json`.
   - Locate the relevant State/UT key.
   - Insert, rename, or remove the district name in alphabetical order.

2. **Sync the Server Dataset**:
   - Copy the updated `indiaStatesDistricts.json` to `server/data/indiaStatesDistricts.json`.

3. **Verify Integrity**:
   - Run the validation test suite:
     ```bash
     node server/tests/verify-repair-form-validation.js
     ```
   - Build the frontend bundle:
     ```bash
     npm run build --prefix client
     ```
   - Confirm that all tests pass without errors.
