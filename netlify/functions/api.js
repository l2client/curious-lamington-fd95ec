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
            'Content-Type': 'application/json'
        };

        // 1. Поиск игрока
        let response = await fetch(`${supabaseUrl}/rest/v1/l2_users?telegram_id=eq.${telegram_id}&select=*`, {
            method: 'GET',
            headers: headers
        });
        let users = await response.json();
        let user = users && users.length > 0 ? users[0] : null;

        // 2. Создание нового персонажа со стартовыми статами
        if (!user) {
            const newUser = {
                telegram_id,
                username,
                class_type: 'warrior',
                level: 1,
                exp: 0,
                hp: 100,
                max_hp: 100,
                mp: 50,
                max_mp: 50,
                p_atk: 15,
                m_atk: 10,
                p_def: 20,
                m_def: 18,
                p_atk_speed: 300,
                m_cast_speed: 330,
                crit: 4,
                adena: 0
            };

            let insertRes = await fetch(`${supabaseUrl}/rest/v1/l2_users`, {
                method: 'POST',
                headers: { ...headers, 'Prefer': 'return=representation' },
                body: JSON.stringify(newUser)
            });
            let inserted = await insertRes.json();
            user = inserted[0];
        }

        // 3. Логика PvE атаки моба (расчет на сервере)
        if (action === 'attack' && user) {
            let gainedExp = 25;
            let gainedAdena = 12;
            let newExp = user.exp + gainedExp;
            let newAdena = user.adena + gainedAdena;
            let newLevel = user.level;
            let newMaxHp = user.max_hp;
            let newMaxMp = user.max_mp;
            let newPAtk = user.p_atk;
            let newPDef = user.p_def;

            // Проверка повышения уровня (каждые 100 EXP)
            const expNeeded = user.level * 100;
            if (newExp >= expNeeded) {
                newLevel += 1;
                newExp -= expNeeded;
                newMaxHp += 20;
                newMaxMp += 10;
                newPAtk += 5;
                newPDef += 4;
            }

            // Обновляем данные в базе строго через сервер
            await fetch(`${supabaseUrl}/rest/v1/l2_users?telegram_id=eq.${telegram_id}`, {
                method: 'PATCH',
                headers: headers,
                body: JSON.stringify({
                    level: newLevel,
                    exp: newExp,
                    adena: newAdena,
                    hp: newMaxHp, // полное восстановление при левелапе
                    max_hp: newMaxHp,
                    max_mp: newMaxMp,
                    p_atk: newPAtk,
                    p_def: newPDef
                })
            });

            // Запрашиваем свежие данные из базы
            let freshRes = await fetch(`${supabaseUrl}/rest/v1/l2_users?telegram_id=eq.${telegram_id}&select=*`, {
                method: 'GET',
                headers: headers
            });
            let freshUsers = await freshRes.json();
            if (freshUsers && freshUsers.length > 0) {
                user = freshUsers[0];
            }
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