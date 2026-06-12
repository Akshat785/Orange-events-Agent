const fs = require('fs');

const envPath = './.env.local';
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    env[key] = (match[2] || '').trim().replace(/^["']|["']$/g, '');
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

async function checkColumns() {
  const tables = ['orange_sessions', 'orange_messages'];
  for (const table of tables) {
    console.log(`\nColumns for table: ${table}`);
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/rpc/get_columns_metadata`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ table_name: table })
        }
      );
      if (res.ok) {
        console.log(await res.json());
      } else {
        // Fallback to querying information_schema via standard select if RPC doesn't exist
        const queryRes = await fetch(
          `${supabaseUrl}/rest/v1/information_schema/columns?table_name=eq.${table}&select=column_name,data_type,is_nullable,column_default`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            }
          }
        );
        if (queryRes.ok) {
          console.log(await queryRes.json());
        } else {
          console.error("Failed fallback:", queryRes.status, await queryRes.text());
        }
      }
    } catch(e) {
      console.error(e);
    }
  }
}

checkColumns();
