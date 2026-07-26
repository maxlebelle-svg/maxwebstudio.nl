# Foundation F0-e — Dummy Common Migration Report

Status: **NOT APPLIED / FIXTURE REMOVED**

De tijdelijke fixture heette `20260721000100_bootstrap_poc_marker.sql`, lag alleen onder de disposable common-root en had SHA-256 `2e76c42915d2f3a3f73a9fd6a4adbe471f96b8fe00b8dac7352810ddbb5f1018`. De fixture zou uitsluitend schema `f0e_poc` met één markerrecord maken.

De CLI stopte vóór uitvoering wegens de ontbrekende baselinefile in de common-root. `to_regclass('f0e_poc.bootstrap_poc_marker')` was `NULL/false`; history bleef op één row. Een tweede clean-run was daardoor niet toegestaan of zinvol. De fixture, tijdelijke common-root en databasecluster zijn door cleanup verwijderd. Er staat geen dummy migration in de product- of bootstrap-migrationsdirectory.
