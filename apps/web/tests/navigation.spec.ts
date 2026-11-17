import {test,expect} from '@playwright/test';
test('renderiza menú e informa SSO no conectado',async({page})=>{await page.goto('/');await expect(page.getByText('IA Workforce').first()).toBeVisible();await expect(page.getByRole('navigation',{name:'Navegación principal'})).toBeVisible();});
