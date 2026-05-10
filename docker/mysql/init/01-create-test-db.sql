-- backend-laravel の PHPUnit テスト用 DB。
-- docker-compose.yml の mysql service が初回起動する際に自動実行する想定。
-- (mount: ./docker/mysql/init:/docker-entrypoint-initdb.d:ro)
--
-- 既存 mysql_data ボリュームを保持したまま追加する場合は、
-- 以下を root 権限で手動実行する：
--   docker compose exec mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
--     < docker/mysql/init/01-create-test-db.sql
--
-- 本 DB は phpunit.xml の DB_DATABASE が参照する。RefreshDatabase trait
-- が各テストで migrate fresh を行う。

CREATE DATABASE IF NOT EXISTS threeds2_demo_test
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON threeds2_demo_test.* TO 'laravel'@'%';
FLUSH PRIVILEGES;
