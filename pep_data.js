const PEP_DATA = {
  "SANDIAGA SALAHUDDIN UNO": {
    "roles": [
      "Menteri Pariwisata & Ekonomi Kreatif RI",
      "Ex-Wagub DKI Jakarta",
      "Ex-Cawapres 2019"
    ]
  },
  "HARY TANOESOEDIBJO": {
    "roles": [
      "Pendiri & Ketua MPP Partai Perindo",
      "Ex-Cawapres 2014",
      "Founder MNC Group"
    ],
    "group": "MNC Group"
  },
  "B.RUDIJANTO TANOESOEDIBJO": {
    "roles": [
      "Kakak Hary Tanoesoedibjo (Ketua Partai Perindo)",
      "CEO Trinity Health Care"
    ],
    "group": "MNC Group"
  },
  "RATNA ENDANG SOELISTYAWATI": {
    "roles": [
      "Presiden Komisaris MNC Investama Tbk (BHIT)",
      "Komisaris MNC Land (KPIG)",
      "Keluarga Tanoesoedibjo"
    ],
    "group": "MNC Group"
  },
  "H HUTOMO MANDALA PUTRA": {
    "roles": [
      "Putra Presiden ke-2 RI Soeharto",
      "Tommy Suharto"
    ]
  },
  "SUJAYA SOEKARNO PUTRA": {
    "roles": [
      "Keluarga Presiden ke-1 RI Soekarno",
      "Direktur Utama Newport Marine Services (BOAT)"
    ],
    "group": "Keluarga Soekarno"
  },
  "SURYA SOEKARNO PUTRA": {
    "roles": [
      "Keluarga Presiden ke-1 RI Soekarno",
      "Direktur Newport Marine Services (BOAT)"
    ],
    "group": "Keluarga Soekarno"
  },
  "DHARMAWATI DJUHANA": {
    "roles": [
      "Komisaris Utama Newport Marine Services (BOAT)",
      "Pengendali akhir BOAT bersama keluarga Soekarno Putra"
    ],
    "group": "Keluarga Soekarno"
  },
  "GARIBALDI THOHIR": {
    "roles": [
      "Kakak Menteri BUMN Erick Thohir",
      "CEO Adaro Energy"
    ],
    "group": "Thohir Family"
  },
  "GAMMA ABDURRAHMAN THOHIR": {
    "roles": [
      "Putra Garibaldi Thohir",
      "Keponakan Menteri BUMN Erick Thohir"
    ],
    "group": "Thohir Family"
  },
  "SOLIHIN JUSUF KALLA": {
    "roles": [
      "Putra Wapres ke-10 & 12 RI Jusuf Kalla",
      "Ketua Bidang Kewiraswastaan DPP Partai Golkar",
      "Presiden Direktur Kalla Group"
    ],
    "group": "Kalla Group"
  },
  "IR ACHMAD KALLA": {
    "roles": [
      "Saudara Wapres Jusuf Kalla",
      "Co-founder Bukaka Teknik Utama"
    ],
    "group": "Kalla Group"
  },
  "DRS SUHAELI KALLA": {
    "roles": [
      "Saudara Wapres Jusuf Kalla",
      "Komisaris Utama Bukaka Teknik Utama"
    ],
    "group": "Kalla Group"
  },
  "SUHAELLY KALLA": {
    "roles": [
      "Saudara Wapres Jusuf Kalla",
      "Keluarga Kalla Group"
    ],
    "group": "Kalla Group"
  },
  "ANINDITHA ANESTYA BAKRIE": {
    "roles": [
      "Putri Aburizal Bakrie",
      "Aburizal Bakrie: Ex-Menko Perekonomian, Ex-Ketum Partai Golkar",
      "Keluarga Bakrie Group"
    ],
    "group": "Bakrie Group"
  },
  "MARUARAR SIRAIT": {
    "roles": [
      "Ex-Anggota DPR RI (3 periode: 2004–2019)",
      "Kader PDIP / Ex-Ketua DPP PDIP",
      "Putra politikus senior Sabam Sirait"
    ]
  },
  "HAPSORO": {
    "roles": [
      "Suami Puan Maharani (Ketua DPR RI)",
      "Menantu Ex-Presiden Megawati Soekarnoputri",
      "Pengusaha (RAJA, ARKO, UANG, SINI, MINA)"
    ],
    "group": "Keluarga Soekarno"
  },
  "FUAD HASAN MASYHUR": {
    "roles": [
      "Ketua DPP Partai Golkar",
      "Wakil Ketua Umum MPN Pemuda Pancasila",
      "Politikus senior Partai Golkar"
    ]
  },
  "EDDY HARIYANTO": {
    "roles": [
      "Ex-Perwira Polisi (Kepolisian RI)",
      "Pemegang saham ASLI (Asri Karya Lestari)"
    ]
  },
  "HJ MEGAWATI TAUFIQ": {
    "roles": [
      "Megawati Soekarnoputri",
      "Presiden ke-5 RI (2001–2004)",
      "Ketua Umum PDI Perjuangan",
      "Taufiq = nama suami (Taufiq Kiemas, Alm.)"
    ],
    "group": "Keluarga Soekarno"
  }
};

const CONGLO_DATA = {
  "PRAJOGO PANGESTU": {
    "roles": [
      "Founder & Chairman Barito Pacific Group",
      "Orang terkaya Indonesia (#1 Forbes)",
      "Petrochemical, geothermal, energy"
    ],
    "group": "Barito Pacific"
  },
  "LOW TUCK KWONG": {
    "roles": [
      "Founder & President Director Bayan Resources",
      "Coal tycoon, #4 Forbes Indonesia"
    ],
    "group": "Bayan Resources"
  },
  "ELAINE LOW": {
    "roles": [
      "Putri Low Tuck Kwong",
      "Pemegang 22% saham Bayan Resources"
    ],
    "group": "Bayan Resources"
  },
  "LOW YI NGO": {
    "roles": [
      "Putra Low Tuck Kwong",
      "Director Sales & Marketing Bayan Resources"
    ],
    "group": "Bayan Resources"
  },
  "JENNY QUANTERO": {
    "roles": [
      "Director Corporate Affairs Bayan Resources",
      "Co-founder Bayan Resources bersama suami Engki Wibowo"
    ],
    "group": "Bayan Resources"
  },
  "ANTHONI SALIM": {
    "roles": [
      "Chairman Salim Group",
      "CEO Indofood (Indomie)",
      "#5 Forbes Indonesia"
    ],
    "group": "Salim Group"
  },
  "EDWIN SOERYADJAYA": {
    "roles": [
      "Founder Saratoga Investama Sedaya",
      "Putra pendiri Astra International (William Soeryadjaya)"
    ],
    "group": "Saratoga"
  },
  "RD EDDY K SARIAATMADJA": {
    "roles": [
      "Founder Elang Mahkota Teknologi (EMTEK)",
      "Pemilik SCTV, Indosiar, Vidio",
      "Media & tech conglomerate"
    ],
    "group": "EMTEK Group"
  },
  "RD FOFO SARIAATMADJA": {
    "roles": [
      "Keluarga Sariaatmadja",
      "EMTEK Group"
    ],
    "group": "EMTEK Group"
  },
  "IR. SUSANTO SUWARTO": {
    "roles": [
      "Co-founder EMTEK",
      "Presiden Komisaris Emtek Group"
    ],
    "group": "EMTEK Group"
  },
  "PIET YAURY": {
    "roles": [
      "Pemegang saham 8-9% Emtek (EMTK)",
      "Ex-Komisaris Emtek"
    ],
    "group": "EMTEK Group"
  },
  "INAWATI NINGSIH JUWONO": {
    "roles": [
      "Pemegang saham Emtek (EMTK)",
      "Lingkaran pendiri Emtek Group"
    ],
    "group": "EMTEK Group"
  },
  "WILLIAM TANUWIJAYA": {
    "roles": [
      "Co-founder Tokopedia / GoTo Group",
      "Young Global Leader, World Economic Forum"
    ],
    "group": "GoTo Group"
  },
  "SABANA PRAWIRA WIDJAJA": {
    "roles": [
      "Presiden Direktur PT Ultrajaya Milk (Ultra Milk)",
      "Keluarga pendiri Ultrajaya"
    ],
    "group": "Ultrajaya"
  },
  "SAMUDERA PRAWIRAWIDJAJA": {
    "roles": [
      "Putra Sabana Prawirawidjaja",
      "Operations Director Ultrajaya, Presdir Campina"
    ],
    "group": "Ultrajaya"
  },
  "SUHENDRA PRAWIRAWIDJAJA": {
    "roles": [
      "Putra Sabana Prawirawidjaja",
      "Komisaris Ultrajaya (ULTJ)"
    ],
    "group": "Ultrajaya"
  },
  "IR. T. PERMADI RACHMAT": {
    "roles": [
      "Founder Triputra Group",
      "Ex-CEO Astra International",
      "Shareholder Adaro Energy"
    ],
    "group": "Triputra Group"
  },
  "NY. T. P. RACHMAT L. R. IMANTO": {
    "roles": [
      "Istri T.P. Rachmat (Triputra Group)",
      "Pengendali Triputra Agro Persada (TAPG)"
    ],
    "group": "Triputra Group"
  },
  "SUDHAMEK AGOENG WASPODO S": {
    "roles": [
      "Chairman GarudaFood / Tudung Group",
      "Pendiri Kacang Garuda, Gery, Suntory Garuda"
    ],
    "group": "GarudaFood"
  },
  "KUSUMODEWININGRUM SUNJOTO": {
    "roles": [
      "Pemegang saham 7-9% GarudaFood (GOOD)",
      "Keluarga Soenjoto (pendiri GarudaFood)"
    ],
    "group": "GarudaFood"
  },
  "PANGAYOMAN ADI SOENJOTO": {
    "roles": [
      "Komisaris GarudaFood Putra Putri Jaya (GOOD)",
      "Keluarga Soenjoto (pendiri GarudaFood)"
    ],
    "group": "GarudaFood"
  },
  "RAHAJOE DEWININGROEM SOENJOTO": {
    "roles": [
      "Ex-Presiden Direktur GarudaFood",
      "Keluarga Soenjoto (pendiri GarudaFood)"
    ],
    "group": "GarudaFood"
  },
  "LESTARI SANTOSO SOENJOTO": {
    "roles": [
      "Ex-Komisaris GarudaFood",
      "Keluarga Soenjoto (Tudung Group)"
    ],
    "group": "GarudaFood"
  },
  "DARMO PRANOTO SOENJOTO": {
    "roles": [
      "Keluarga Soenjoto (pendiri GarudaFood)",
      "Pemegang saham GarudaFood (GOOD)"
    ],
    "group": "GarudaFood"
  },
  "PRODJO HANDOJO SUNJOTO": {
    "roles": [
      "Pemegang saham 6-9% GarudaFood (GOOD)",
      "Keluarga Soenjoto (Tudung Group)"
    ],
    "group": "GarudaFood"
  },
  "JUNIASTUTI": {
    "roles": [
      "Pemegang saham 5%+ GarudaFood (GOOD)",
      "Keluarga Tudung Group"
    ],
    "group": "GarudaFood"
  },
  "UNTUNG RAHARDJO": {
    "roles": [
      "Ex-Komisaris GarudaFood (GOOD)",
      "Keluarga Soenjoto (Tudung Group)"
    ],
    "group": "GarudaFood"
  },
  "TAHIR": {
    "roles": [
      "Founder Mayapada Group",
      "Billionaire banking & property"
    ],
    "group": "Mayapada Group"
  },
  "JONATHAN TAHIR": {
    "roles": [
      "Putra Dato Sri Tahir",
      "Mayapada Group"
    ],
    "group": "Mayapada Group"
  },
  "DJOKO SUSANTO": {
    "roles": [
      "Pendiri Alfamart (AlfaCorp)",
      "#14 Forbes Indonesia",
      "Alfamart, Alfamidi, DAN+DAN, Lawson"
    ],
    "group": "Alfa Group"
  },
  "TRIHATMA KUSUMA HALIMAN": {
    "roles": [
      "CEO Agung Podomoro Group",
      "Developer terbesar Indonesia",
      "Senayan City, Central Park, Thamrin City"
    ],
    "group": "Agung Podomoro"
  },
  "JUNI SETIAWATI WONOWIDJOJO": {
    "roles": [
      "Presiden Komisaris PT Gudang Garam Tbk",
      "Keluarga Wonowidjojo (Gudang Garam)"
    ],
    "group": "Gudang Garam"
  },
  "SIGID SUMARGO WONOWIDJOJO": {
    "roles": [
      "Putra Surya Wonowidjojo (pendiri Gudang Garam)",
      "Ex-Director Marketing Gudang Garam"
    ],
    "group": "Gudang Garam"
  },
  "HARTADI ANGKOSUBROTO": {
    "roles": [
      "Gunung Sewu Group (Great Giant Foods)",
      "Putra Dasuki Angkosubroto (pendiri)"
    ],
    "group": "Gunung Sewu"
  },
  "PIETER TANURI": {
    "roles": [
      "Pemilik Bali United (BOLA)",
      "Presiden Direktur Multistrada Arah Sarana",
      "Founder Trimegah Securities"
    ],
    "group": "Tanuri Group"
  },
  "YABES TANURI": {
    "roles": [
      "Adik Pieter Tanuri",
      "CEO Bali United (BOLA)",
      "Pemilik lisensi perantara pedagang efek"
    ],
    "group": "Tanuri Group"
  },
  "VERONICA COLONDAM": {
    "roles": [
      "Pemegang saham Bali United (BOLA), CARS, Trimegah (TRIM)",
      "Lingkaran Tanuri Group"
    ],
    "group": "Tanuri Group"
  },
  "LO KHENG  HONG. DRS": {
    "roles": [
      "\"Warren Buffett of Indonesia\"",
      "Value investor legendaris",
      "Portofolio saham senilai ~Rp2 triliun"
    ]
  },
  "ACHMAD ZAKY SYAIFUDIN": {
    "roles": [
      "Founder Bukalapak",
      "Founder Init 6 (venture capital)"
    ],
    "group": "Bukalapak"
  },
  "MU MIN ALI GUNAWAN": {
    "roles": [
      "Founder Panin Group (Bank Panin)",
      "Banking tycoon, net worth ~US$1.3B"
    ],
    "group": "Panin Group"
  },
  "OTTO TOTO SUGIRI": {
    "roles": [
      "Founder DCI Indonesia (data center terbesar RI)",
      "Founder Sigma Cipta Caraka & Telkomsigma"
    ],
    "group": "DCI Indonesia"
  },
  "TANDEAN RUSTANDY": {
    "roles": [
      "Founder & CEO Arwana Citramulia (ARNA)",
      "Produsen keramik terbesar Indonesia"
    ],
    "group": "Arwana Group"
  },
  "SUGIMAN HALIM": {
    "roles": [
      "Konglomerat & investor saham besar",
      "Pemegang saham besar di BRMS, BOAT, DOSS"
    ]
  },
  "BAMBANG SUTANTIO": {
    "roles": [
      "Founder & Presiden Komisaris Cimory Group",
      "Billionaire (Forbes Indonesia)"
    ],
    "group": "Cimory Group"
  },
  "FARELL GRANDISURI": {
    "roles": [
      "CEO & Presiden Direktur Cimory Group",
      "Putra Bambang Sutantio"
    ],
    "group": "Cimory Group"
  },
  "STELLA ISABELLA DJOHAN": {
    "roles": [
      "Pemilik Sentul City (BKSL)",
      "Konglomerat properti"
    ]
  },
  "SUZANNA TANOJO": {
    "roles": [
      "Pemilik Victoria Group (banking, finance, securities)",
      "Putri keluarga Wings Group"
    ],
    "group": "Victoria Group"
  },
  "JIMMY BUDIARTO": {
    "roles": [
      "Founder & Chairman J Resources Asia Pasifik (PSAB)",
      "Major gold mining conglomerate"
    ],
    "group": "J Resources"
  },
  "SUNGKONO HONORIS": {
    "roles": [
      "Presiden Direktur PT Modern Internasional (MDRN)",
      "Keluarga Honoris (Modern Group)"
    ],
    "group": "Modern Group"
  },
  "WINATO KARTONO": {
    "roles": [
      "Founder Provident Capital Indonesia",
      "Presiden Komisaris Merdeka Battery Materials (MBMA)"
    ],
    "group": "Provident Capital"
  },
  "HARDI WIJAYA LIONG": {
    "roles": [
      "Founding Partner Provident Capital",
      "CEO Tower Bersama Infrastructure",
      "Direktur Merdeka Copper Gold"
    ],
    "group": "Provident Capital"
  },
  "CHRISTOPHER SUMASTO TJIA": {
    "roles": [
      "Owner PAM Group (property, mining, hospitality)",
      "Presiden Direktur Bima Sakti Pertiwi (PAMG)"
    ],
    "group": "PAM Group"
  },
  "CLARISSA ADY SUMASTO TJIA": {
    "roles": [
      "Komisaris Wulandari Bangun Laksana (BSBK)",
      "Keluarga Sumasto Tjia (PAM Group)"
    ],
    "group": "PAM Group"
  },
  "HETTY SOETIKNO, DRA": {
    "roles": [
      "Co-founder Dexa Medica Group",
      "Controlling shareholder Medela Potentia (MDLA)"
    ],
    "group": "Dexa Group"
  },
  "HARYANTO TJIPTODIHARDJO": {
    "roles": [
      "Presiden Direktur Impack Pratama Industri (IMPC)",
      "Billionaire, top 10 Forbes Indonesia"
    ],
    "group": "Impack Group"
  },
  "DRA MEDYA LENGKEY S.": {
    "roles": [
      "Pemegang saham 16,6% Metrodata Electronics (MTDL)",
      "Istri Hiskak Secakusuma (Pembangunan Jaya Group)"
    ],
    "group": "Pembangunan Jaya"
  },
  "MOH.A.R.P.MANGKUNINGRAT": {
    "roles": [
      "Presiden Direktur Indika Energy",
      "Chairman KADIN Indonesia"
    ],
    "group": "Indika Energy"
  },
  "CHANDER VINOD LAROYA": {
    "roles": [
      "Founder Akraya International",
      "Vice Presiden Komisaris ESSA Industries Indonesia"
    ],
    "group": "Akraya Group"
  },
  "DIAH ASRININGPURI SUGIANTO": {
    "roles": [
      "Putri Eddy Sugianto",
      "Komisaris Prima Andalan Mandiri (Mandiri Coal)"
    ],
    "group": "Mandiri Coal"
  },
  "RUDI TANOKO": {
    "roles": [
      "Pemegang saham Avia Avian (AVIA)",
      "Keluarga Tanoko (Tancorp / Avian Group)"
    ],
    "group": "Avian Group"
  },
  "PHILIP SUWARDI PURNAMA": {
    "roles": [
      "Pemegang saham ~3% Merdeka Battery Materials",
      "Ex-Direktur Indofood & Trimegah Securities"
    ]
  },
  "FRANKY OESMAN WIDJAJA": {
    "roles": [
      "Putra Eka Tjipta Widjaja (pendiri Sinar Mas)",
      "CEO/Chairman Golden Agri-Resources",
      "Konglomerat agribisnis & telekomunikasi"
    ],
    "group": "Sinar Mas"
  },
  "MUKTAR WIDJAJA": {
    "roles": [
      "Putra Eka Tjipta Widjaja (pendiri Sinar Mas)",
      "Executive Director Golden Agri-Resources",
      "CEO Sinarmas Land"
    ],
    "group": "Sinar Mas"
  },
  "SANDIAGA SALAHUDDIN UNO": {
    "roles": [
      "Co-founder Saratoga Investama Sedaya",
      "Investor & entrepreneur"
    ],
    "group": "Saratoga"
  },
  "GARIBALDI THOHIR": {
    "roles": [
      "CEO & Co-founder Adaro Energy",
      "Pendiri Saratoga bersama Edwin Soeryadjaya"
    ],
    "group": "Adaro / Thohir Family"
  },
  "GAMMA ABDURRAHMAN THOHIR": {
    "roles": [
      "Putra Garibaldi Thohir",
      "Pemegang saham CARS"
    ],
    "group": "Adaro / Thohir Family"
  },
  "HARY TANOESOEDIBJO": {
    "roles": [
      "Founder MNC Group",
      "Pemilik RCTI, MNC TV, GTV, iNews"
    ],
    "group": "MNC Group"
  },
  "B.RUDIJANTO TANOESOEDIBJO": {
    "roles": [
      "Kakak Hary Tanoesoedibjo",
      "CEO Trinity Health Care, MNC Group"
    ],
    "group": "MNC Group"
  },
  "RATNA ENDANG SOELISTYAWATI": {
    "roles": [
      "Presiden Komisaris MNC Investama (BHIT)",
      "Keluarga Tanoesoedibjo"
    ],
    "group": "MNC Group"
  },
  "SOLIHIN JUSUF KALLA": {
    "roles": [
      "Presiden Direktur Kalla Group",
      "Putra Wapres Jusuf Kalla"
    ],
    "group": "Kalla Group"
  },
  "IR ACHMAD KALLA": {
    "roles": [
      "Co-founder Bukaka Teknik Utama",
      "Keluarga Kalla"
    ],
    "group": "Kalla Group"
  },
  "DRS SUHAELI KALLA": {
    "roles": [
      "Komisaris Utama Bukaka Teknik Utama",
      "Keluarga Kalla"
    ],
    "group": "Kalla Group"
  },
  "SUHAELLY KALLA": {
    "roles": [
      "Keluarga Kalla Group"
    ],
    "group": "Kalla Group"
  },
  "ANINDITHA ANESTYA BAKRIE": {
    "roles": [
      "Putri Aburizal Bakrie",
      "Keluarga Bakrie Group"
    ],
    "group": "Bakrie Group"
  }
};
