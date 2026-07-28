# Личный финансовый кабинет (Supabase)

Мультипользовательский персональный финансовый менеджер.

- Frontend: HTML5, CSS3, Vanilla JS (ES Modules)
- Backend: Supabase Auth + PostgreSQL + Storage + Realtime
- Офлайн: localStorage-кэш + очередь синхронизации

## Быстрый старт

### 1. Создайте проект Supabase

1. Откройте [supabase.com](https://supabase.com) и создайте проект
2. SQL Editor → вставьте и выполните `supabase/schema.sql`
3. Authentication → Providers → Email включён
4. (Опционально) отключите «Confirm email» для быстрых тестов

### 2. Укажите ключи

В файле `config.js` или скопируйте `config.example.js` → `config.local.js`:

```js
export const SUPABASE_URL = 'https://XXXX.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

Значения: Project Settings → API → Project URL и `anon` `public` key.

### 3. Примените схему БД

SQL Editor → выполните **один файл** `supabase/schema.sql`  
(полная схема: таблицы, периоды, RLS, storage, bootstrap).

Файл `supabase/periods.sql` оставлен для старых проектов (миграции). Для новых достаточно `schema.sql`.

### 4. Проверьте соединение

Откройте http://localhost:8080/supabase/diagnose.html

Должны быть зелёными Auth API и все 16 таблиц.

### 3. Запуск

Нужен локальный HTTP-сервер (ES-модули + CDN Supabase):

```powershell
Set-Location -LiteralPath 'E:\Ксюша\Проекты курсор\nest2\test'
python -m http.server 8080
```

Откройте http://localhost:8080

- без сессии → `auth/login.html`
- после входа → `app.html`

## Архитектура

```
auth/           # Login / Register / Reset
dashboard/      # Точка входа приложения
services/       # Auth, Database, Budget, Credit, …
storage/        # LocalCache, OfflineQueue
helpers/        # utils, format, export
components/     # AppUI, charts, toast
income|budget|expenses|credits|utilities|analytics|calendar|profile|settings/
supabase/       # schema.sql (таблицы + RLS + bootstrap)
```

Все обращения к данным — только через сервисы. UI не ходит в Supabase напрямую (кроме AuthService/DatabaseService/StorageService).

## Финансовые периоды

Все операционные данные привязаны к `period_id` (месяц/год).

### Настройка БД

Выполните `supabase/schema.sql` (уже включает периоды и RLS).  
`supabase/periods.sql` — только если обновляете старую БД без периодов.

### Возможности

- Переключатель **◀ Июль 2026 ▶** в шапке + выпадающий список по годам
- Открытие нового месяца с переносом остатков / копированием категорий, кредитов, ЖКХ, целей, регулярных платежей
- Правила переноса по конвертам: всегда / остаток / обнулять / максимум / не переносить
- **Закрыть месяц** → отчёт + следующий период
- План/факт с отклонениями ₽ и %
- Страницы **Сравнение** и **Архив**
- Годовая аналитика
- Календарь: доходы, покупки, кредиты, ЖКХ, регулярные платежи, закрытие периода

Закрытый период доступен только для просмотра, пока пользователь явно не разблокирует редактирование.


## Офлайн и синхронизация

1. Изменения сразу пишутся в `LocalCache`
2. При отсутствии сети — в `OfflineQueue`
3. При `online` / возврате во вкладку — `SyncService` отправляет очередь и делает `pullAll`
4. Realtime подписки обновляют кэш с других устройств

## Экспорт

В настройках:

- JSON
- CSV
- PDF (простой текстовый отчёт)
- Импорт JSON

## Профиль

Аватар (Supabase Storage bucket `avatars`), имя, смена пароля, статистика, удаление данных кабинета.

> Полное удаление пользователя в Auth требует Edge Function с service role. Клиент очищает данные и выполняет выход.

## Проверка

После настройки ключей проверьте:

1. Регистрация и автоматические конверты  
2. Вход / выход  
3. Восстановление пароля (письмо)  
4. Доход → распределение → покупка  
5. Кредит / ЖКХ / цели  
6. История, аналитика, календарь  
7. Экспорт / импорт  
8. Вход с другого браузера — те же данные  
9. Офлайн: DevTools → Offline → операция → Online → sync  

## Безопасность

- Пароли не хранятся в приложении
- Сессия и refresh-токены — через Supabase Auth
- При `SIGNED_OUT` — редирект на Login
