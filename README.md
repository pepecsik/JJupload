# JJupload

Video-uploadpagina voor Joost en Jenneke's 40-jarig huwelijksfeest. Gasten
vullen hun naam in en uploaden video's, die via de server in `server/`
rechtstreeks in een Google Drive-map terechtkomen (geen inloggen nodig
voor gasten -- de server gebruikt een Google service account).

Live: https://pepecsik.github.io/jjupload/

De server in `server/` wordt los gedeployed (op Render). Zijn omgevings-
variabelen (`GOOGLE_SERVICE_ACCOUNT_KEY`, `DRIVE_FOLDER_ID`,
`ALLOWED_ORIGIN`) staan niet in deze repo.
