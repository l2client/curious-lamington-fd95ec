exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const data = JSON.parse(event.body);
        const telegram_id = data.telegram_id;
        const username = data.username || 'Герой';
        const action = data.action || '';

        if (!telegram_id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'No telegram_id provided' }) };
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY;

        const headers = {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };

        // 1. Ищем игрока в базе
        let response = await fetch(`${supabaseUrl}/rest/v1/l2_users?telegram_id=eq.${telegram_id}&select=*`, {
            method: 'GET',
            headers: headers
        });
        let users = await response.json();
        let user = users && users.length > 0 ? users[0] : null;

        // 2. Если игрока нет — создаем
        if (!user) {
            let insertRes = await fetch(`${supabaseUrl}/rest/v1/l2_users`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ telegram_id, username, level: 1, exp: 0, hp: 100, max_hp: 100, adena: 0 })
            });
            let inserted = await insertRes.json();
            user = inserted[0];
        }

        // 3. Если пришла команда атаки
        if (action === 'attack' && user) {
            const newExp = user.exp + 15;
            const newAdena = user.adena + 10;

            let updateRes = await fetch(`${supabaseUrl}/rest/v1/l2_users?telegram_id=eq.${telegram_id}`, {
                method: 'PATCH',
                headers: headers,
                body: JSON.stringify({ exp: newExp, adena: newAdena })
            });
            let updated = await updateRes.json();
            user = updated[0] || user;
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, user })
        };

    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};