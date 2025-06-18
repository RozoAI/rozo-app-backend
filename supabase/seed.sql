-- Clean seed data without pg_dump headers

-- Insert currencies
INSERT INTO "public"."currencies" ("currency_id", "display_name", "usd_price") VALUES
	('MYR', 'Malaysian Ringgit', 0.24),
	('SGD', 'Singapore Dollar', 0.78),
	('USD', 'United States Dollar', 1),
	('IDR', 'Indonesian Rupiah', 0.000062);

-- Insert languages
INSERT INTO "public"."languages" ("language_id", "display_name") VALUES
	('ZH', 'Chinese (Mandarin)'),
	('HI', 'Hindi'),
	('ES', 'Spanish'),
	('FR', 'French'),
	('AR', 'Arabic'),
	('BN', 'Bengali'),
	('RU', 'Russian'),
	('PT', 'Portuguese'),
	('ID', 'Indonesian'),
	('EN', 'English');

-- Insert tokens
INSERT INTO "public"."tokens" ("token_id", "token_name", "token_address", "chain_id", "chain_name") VALUES
	('USDC_BASE', 'USDC', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', '8453', 'BASE');
