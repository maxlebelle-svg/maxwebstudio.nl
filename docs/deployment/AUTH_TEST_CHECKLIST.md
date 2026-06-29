# Auth Test Checklist

Status: verplicht vóór deployment GO.

## Login en sessie

- [ ] Demo login werkt.
- [ ] Admin login voorbereid/getest.
- [ ] Customer login voorbereid/getest.
- [ ] Logout werkt.
- [ ] Session refresh werkt of faalt veilig.

## Profiles

- [ ] Customer profile link getest.
- [ ] Profile naar customer ownership getest.
- [ ] Role mapping getest.
- [ ] Profile status `active` getest.
- [ ] Profile status `disabled` getest.

## Route guards

- [ ] Soft mode getest.
- [ ] Hard mode testscenario voorbereid.
- [ ] Admin-dashboard route getest.
- [ ] Klantportaal route getest.
- [ ] Developer tools route getest.

## Rollen

- [ ] super_admin/admin.
- [ ] sales.
- [ ] support.
- [ ] developer.
- [ ] customer.
- [ ] demo_user.
- [ ] anonymous.

## Notes

Geen echte secrets in testnotities zetten.
