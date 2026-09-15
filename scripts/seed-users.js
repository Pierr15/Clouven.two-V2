import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const users = [
  {
    name: "Ahlif Annisa",
    username: "25.22919",
    password: "clouven2",
    number: "1",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Arina Maziya",
    username: "25.22959",
    password: "clouven2",
    number: "2",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Aula Shabirina",
    username: "25.22960",
    password: "clouven2",
    number: "3",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Baiti Cahaya Andini",
    username: "25.23001",
    password: "clouven2",
    number: "4",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Candra Nila Oktaviana",
    username: "25.23029",
    password: "clouven2",
    number: "5",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Daffi Al Hammani",
    username: "25.23003",
    password: "clouven2",
    number: "6",
    role: "class_officer",
    classRole: "Ketua kelas",
  },
  {
    name: "Danika Farhani",
    username: "25.23004",
    password: "clouven2",
    number: "7",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Donisah",
    username: "25.23030",
    password: "clouven2",
    number: "8",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Faradila Maula",
    username: "25.22966",
    password: "clouven2",
    number: "9",
    role: "class_officer",
    classRole: "Sekretaris",
  },
  {
    name: "Farhan Azhar",
    username: "25.22967",
    password: "clouven2",
    number: "10",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Hafiizh Akmal Riyadi",
    username: "25.23032",
    password: "clouven2",
    number: "11",
    role: "class_officer",
    classRole: "Wakil ketua",
  },
  {
    name: "Hana Maheera Muthianiqa",
    username: "25.22970",
    password: "clouven2",
    number: "12",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Lutfia Nazwa Ramadhan Nurhiday",
    username: "25.23036",
    password: "clouven2",
    number: "13",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "M. Fahri Javier Satya Pradita",
    username: "25.22976",
    password: "pierr151109",
    number: "14",
    role: "developer",
    classRole: "Anggota",
  },
  {
    name: "M. Rahmatul Arifin",
    username: "25.22977",
    password: "clouven2",
    number: "15",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Mishel Ramadhani",
    username: "25.22980",
    password: "clouven2",
    number: "16",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Muhammad Rifqi Faizal",
    username: "25.23012",
    password: "clouven2",
    number: "17",
    role: "developer",
    classRole: "Anggota",
  },
  {
    name: "Muhammad Rizki Akbar",
    username: "25.23013",
    password: "clouven2",
    number: "18",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Musyaffa Hanif Sunni",
    username: "25.23042",
    password: "clouven2",
    number: "19",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Nadya Shafwah",
    username: "25.22981",
    password: "clouven2",
    number: "20",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Nasya Anaya Putri",
    username: "25.23015",
    password: "clouven2",
    number: "21",
    role: "class_officer",
    classRole: "Bendahara",
  },
  {
    name: "Nawal Fauziatul Awliya",
    username: "25.22942",
    password: "clouven2",
    number: "22",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Nayra Cellia Ankadira",
    username: "25.23016",
    password: "clouven2",
    number: "23",
    role: "class_officer",
    classRole: "Sekretaris",
  },
  {
    name: "Nazliza Arliana Putri",
    username: "25.23044",
    password: "clouven2",
    number: "24",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Nur Nadya Ulya",
    username: "25.23047",
    password: "clouven2",
    number: "25",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Nurlia Azizah",
    username: "25.23048",
    password: "clouven2",
    number: "26",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Nurul Qonita Asriya",
    username: "25.23050",
    password: "clouven2",
    number: "27",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Rafa Aditya",
    username: "25.22946",
    password: "clouven2",
    number: "28",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Riffi Gunawan",
    username: "25.22983",
    password: "clouven2",
    number: "29",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Selinafya Eldiana",
    username: "25.23022",
    password: "clouven2",
    number: "30",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Siti Nur Hikmah",
    username: "25.22985",
    password: "clouven2",
    number: "31",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Syifa Fadillah Murtono",
    username: "25.22986",
    password: "clouven2",
    number: "32",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Talita Yumna Al- Mudzakkirah",
    username: "25.23057",
    password: "clouven2",
    number: "33",
    role: "class_officer",
    classRole: "Bendahara",
  },
  {
    name: "Tiara Zenitasari",
    username: "25.22952",
    password: "clouven2",
    number: "34",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "Titin Sofiyatunnisa",
    username: "25.22987",
    password: "clouven2",
    number: "35",
    role: "student",
    classRole: "Anggota",
  },
  {
    name: "WafiyatuSyafaMaulida",
    username: "25.23061",
    password: "clouven2",
    number: "36",
    role: "student",
    classRole: "Anggota",
  },

  // Wali kelas: ganti username placeholder sebelum seed dijalankan.
  {
    name: "SalmanAlfarizi,S.Kom",
    username: "Pak Salman",
    password: "walikelas",
    number: "",
    role: "teacher",
    classRole: "Wali Kelas",
  },
];

function normalizeUsername(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

async function findExistingUser(email) {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw error;

    const found = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );

    if (found) return found;
    if (data.users.length < 1000) return null;

    page++;
  }
}

async function seedUser(entry) {
  const username = normalizeUsername(entry.username);
  const email = `${username}@clouven.local`;

  console.log(`\n→ ${entry.name} (${username})`);

  const existing = await findExistingUser(email);

  if (existing) {
    console.log("  Menghapus akun lama...");

    const { error: deleteError } = await supabase.auth.admin.deleteUser(
      existing.id,
    );

    if (deleteError) throw deleteError;

    await supabase.from("members").delete().eq("id", existing.id);
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: entry.password,
    email_confirm: true,
    user_metadata: {
      name: entry.name,
      username,
    },
  });

  if (error) throw error;

  const createdUser = data.user;

  const { error: memberError } = await supabase.from("members").upsert({
    id: createdUser.id,
    name: entry.name,
    username,
    number: String(entry.number ?? ""),
    role: entry.role,
    class_role: entry.classRole || "Anggota",
    created_by: createdUser.id,
    updated_at: new Date().toISOString(),
  });

  if (memberError) {
    await supabase.auth.admin.deleteUser(createdUser.id);
    throw memberError;
  }

  console.log("  ✓ selesai");
}

async function main() {
  console.log(`Mulai seed ${users.length} user...`);

  for (const user of users) {
    try {
      await seedUser(user);
    } catch (error) {
      console.error(`✗ Gagal: ${user.name}`);
      console.error(error);
    }
  }

  console.log("\nSeed selesai.");
}

main().catch((error) => {
  console.error("Seed gagal total:", error);
  process.exit(1);
});
