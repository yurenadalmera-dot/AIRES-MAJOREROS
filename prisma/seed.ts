/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, subDays, format } from "date-fns";
import { calculateCommissions } from "../lib/money";
import { BUSINESS_TYPES } from "../lib/constants";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "demo1234";

async function main() {
  console.log("🌱 Sembrando datos de demostración (ficticios, sin datos bancarios reales)...");

  // Limpieza completa (idempotente para poder relanzar el seed)
  await prisma.invoiceLine.deleteMany();
  await prisma.cleaningTask.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.partnerSplitConfig.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.property.deleteMany();
  await prisma.owner.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.integrationSettings.deleteMany();
  await prisma.user.deleteMany();
  await prisma.business.deleteMany();
  await prisma.organization.deleteMany();

  // ---------------------------------------------------------------------
  // Organización y negocios
  // ---------------------------------------------------------------------
  const org = await prisma.organization.create({
    data: { name: "Grupo demo — Fuerteventura" },
  });

  const rentalBusiness = await prisma.business.create({
    data: {
      organizationId: org.id,
      type: BUSINESS_TYPES.RENTAL_MANAGEMENT,
      name: "Emma Ferrer · Alquileres Vacacionales",
      legalName: "Emma Ferrer Rodríguez (Autónoma) — nombre de demostración",
      taxId: null,
      contactEmail: "emma@example.com",
      contactPhone: "+34 600 000 001",
    },
  });

  const cleaningBusiness = await prisma.business.create({
    data: {
      organizationId: org.id,
      type: BUSINESS_TYPES.CLEANING_BILLING,
      name: "Aires Majoreros · Limpiezas",
      legalName: "Aires Majoreros, S.L. — nombre de demostración",
      taxId: null,
      contactEmail: "facturacion@example.com",
      contactPhone: "+34 600 000 002",
    },
  });

  // ---------------------------------------------------------------------
  // Usuarios de acceso (demo)
  // ---------------------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await prisma.user.createMany({
    data: [
      {
        organizationId: org.id,
        name: "Emma Ferrer",
        email: "emma@example.com",
        passwordHash,
        role: "RENTAL_MANAGER",
      },
      {
        organizationId: org.id,
        name: "Socia 1",
        email: "socia1@example.com",
        passwordHash,
        role: "PARTNER",
      },
      {
        organizationId: org.id,
        name: "Socia 2",
        email: "socia2@example.com",
        passwordHash,
        role: "PARTNER",
      },
      {
        organizationId: org.id,
        name: "Administración",
        email: "admin@example.com",
        passwordHash,
        role: "ADMIN",
      },
    ],
  });

  // ---------------------------------------------------------------------
  // Propietarios (dueños de las viviendas gestionadas por Emma)
  // ---------------------------------------------------------------------
  const [ownerSantana, ownerMuller, ownerInverfuer, ownerKlein] = await Promise.all([
    prisma.owner.create({
      data: {
        organizationId: org.id,
        name: "Familia Santana Cabrera",
        email: "santana.propietarios@example.com",
        phone: "+34 610 111 222",
      },
    }),
    prisma.owner.create({
      data: {
        organizationId: org.id,
        name: "Sandra & Peter Müller",
        email: "muller.property@example.com",
        phone: "+49 151 000 0000",
      },
    }),
    prisma.owner.create({
      data: {
        organizationId: org.id,
        name: "Inversiones Majorera S.L.",
        email: "administracion@inversionesmajorera.example",
        phone: "+34 928 000 000",
      },
    }),
    prisma.owner.create({
      data: {
        organizationId: org.id,
        name: "Roberto Klein",
        email: "roberto.klein@example.com",
        phone: "+41 79 000 00 00",
      },
    }),
  ]);

  // ---------------------------------------------------------------------
  // Viviendas (Fuerteventura, ficticias pero realistas)
  // ---------------------------------------------------------------------
  const propertiesData = [
    {
      name: "Villa Duna Corralejo",
      locality: "Corralejo",
      address: "C/ Anzuelo 14, Corralejo",
      capacity: 6,
      bedrooms: 3,
      bathrooms: 2,
      cleaningPrice: 55,
      ownerId: ownerSantana.id,
      lodgifyPropertyId: "lodgify-1001",
    },
    {
      name: "Apartamento Faro El Cotillo",
      locality: "El Cotillo",
      address: "Av. Marítima 8, El Cotillo",
      capacity: 4,
      bedrooms: 2,
      bathrooms: 1,
      cleaningPrice: 40,
      ownerId: ownerMuller.id,
      lodgifyPropertyId: "lodgify-1002",
    },
    {
      name: "Bungalow Costa Calma Sur",
      locality: "Costa Calma",
      address: "Urb. Sotavento 22, Costa Calma",
      capacity: 4,
      bedrooms: 2,
      bathrooms: 2,
      cleaningPrice: 45,
      ownerId: ownerInverfuer.id,
      lodgifyPropertyId: "lodgify-1003",
    },
    {
      name: "Ático Caleta de Fuste Golf",
      locality: "Caleta de Fuste",
      address: "C/ Islas Canarias 3, Caleta de Fuste",
      capacity: 3,
      bedrooms: 1,
      bathrooms: 1,
      cleaningPrice: 35,
      ownerId: ownerKlein.id,
      lodgifyPropertyId: "lodgify-1004",
    },
    {
      name: "Casa Rural Villaverde",
      locality: "Villaverde",
      address: "Camino Los Molinos 5, Villaverde",
      capacity: 5,
      bedrooms: 3,
      bathrooms: 2,
      cleaningPrice: 50,
      ownerId: ownerSantana.id,
      lodgifyPropertyId: "lodgify-1005",
    },
    {
      name: "Loft Puerto del Rosario Centro",
      locality: "Puerto del Rosario",
      address: "C/ León y Castillo 47, Puerto del Rosario",
      capacity: 2,
      bedrooms: 1,
      bathrooms: 1,
      cleaningPrice: 30,
      ownerId: ownerInverfuer.id,
      lodgifyPropertyId: "lodgify-1006",
    },
    {
      name: "Villa Jandía Playa",
      locality: "Morro Jable",
      address: "Urb. Jandía Playa 9, Morro Jable",
      capacity: 8,
      bedrooms: 4,
      bathrooms: 3,
      cleaningPrice: 65,
      ownerId: ownerKlein.id,
      lodgifyPropertyId: "lodgify-1007",
    },
  ];

  const properties = [];
  for (const p of propertiesData) {
    properties.push(
      await prisma.property.create({ data: { organizationId: org.id, active: true, ...p } })
    );
  }

  // ---------------------------------------------------------------------
  // Empleadas
  // ---------------------------------------------------------------------
  const employees = await Promise.all([
    prisma.employee.create({
      data: {
        organizationId: org.id,
        name: "María José Cabrera",
        role: "CLEANING",
        phone: "+34 620 111 111",
      },
    }),
    prisma.employee.create({
      data: {
        organizationId: org.id,
        name: "Ana Rosa Perdomo",
        role: "CLEANING",
        phone: "+34 620 222 222",
      },
    }),
    prisma.employee.create({
      data: {
        organizationId: org.id,
        name: "Lucía Betancort",
        role: "BOTH",
        phone: "+34 620 333 333",
      },
    }),
    prisma.employee.create({
      data: {
        organizationId: org.id,
        name: "Juan Domínguez",
        role: "MAINTENANCE",
        phone: "+34 620 444 444",
      },
    }),
  ]);

  // ---------------------------------------------------------------------
  // Socias e integración
  // ---------------------------------------------------------------------
  const [partnerA, partnerB] = await Promise.all([
    prisma.partner.create({ data: { organizationId: org.id, name: "Socia 1", email: "socia1@example.com" } }),
    prisma.partner.create({ data: { organizationId: org.id, name: "Socia 2", email: "socia2@example.com" } }),
  ]);

  await prisma.partnerSplitConfig.create({
    data: {
      organizationId: org.id,
      partnerAId: partnerA.id,
      partnerBId: partnerB.id,
      partnerAPercent: 50,
      partnerBPercent: 50,
    },
  });

  await prisma.integrationSettings.create({
    data: {
      organizationId: org.id,
      provider: "LODGIFY",
      apiKeyMasked: null,
      defaultPlatformPct: 15,
      defaultBankPct: 2.5,
      syncEnabled: true,
    },
  });

  // ---------------------------------------------------------------------
  // Reservas — repartidas en el pasado, presente y futuro respecto a hoy
  // ---------------------------------------------------------------------
  const today = new Date();
  const channels = ["Airbnb", "Booking.com", "Lodgify", "Directo", "VRBO / Expedia"];
  const guestNames = [
    "Laura Fernández",
    "Thomas Weber",
    "Julie Lambert",
    "Marco Rossi",
    "Emily Johnson",
    "Sven Andersen",
    "Carla Ribeiro",
    "David Smith",
    "Anke Schmidt",
    "Noa Cohen",
    "Piotr Kowalski",
    "Isabel Alonso",
  ];

  let guestIdx = 0;
  function nextGuest() {
    const g = guestNames[guestIdx % guestNames.length];
    guestIdx++;
    return g;
  }

  interface BookingSeed {
    propertyIdx: number;
    checkIn: Date;
    checkOut: Date;
    channel: string;
    totalPrice: number;
    source: "MANUAL" | "LODGIFY";
    lodgifyBookingId?: string;
    manuallyAdjusted?: boolean;
    overridePlatformPct?: number;
    overrideBankPct?: number;
  }

  const bookingSeeds: BookingSeed[] = [
    // Estancias en curso hoy (para el panel del día / calendario)
    { propertyIdx: 0, checkIn: subDays(today, 2), checkOut: addDays(today, 3), channel: "Airbnb", totalPrice: 780, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2001" },
    { propertyIdx: 2, checkIn: subDays(today, 1), checkOut: addDays(today, 4), channel: "Booking.com", totalPrice: 620, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2002" },
    { propertyIdx: 5, checkIn: subDays(today, 3), checkOut: addDays(today, 1), channel: "Directo", totalPrice: 260, source: "MANUAL" },

    // Entrada hoy
    { propertyIdx: 1, checkIn: today, checkOut: addDays(today, 5), channel: "Airbnb", totalPrice: 540, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2003" },
    { propertyIdx: 6, checkIn: today, checkOut: addDays(today, 7), channel: "VRBO / Expedia", totalPrice: 1450, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2004" },

    // Salida hoy
    { propertyIdx: 3, checkIn: subDays(today, 4), checkOut: today, channel: "Booking.com", totalPrice: 385, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2005" },
    { propertyIdx: 4, checkIn: subDays(today, 6), checkOut: today, channel: "Lodgify", totalPrice: 690, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2006" },

    // Próximos días (semana en curso)
    { propertyIdx: 0, checkIn: addDays(today, 4), checkOut: addDays(today, 9), channel: "Airbnb", totalPrice: 810, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2007" },
    { propertyIdx: 1, checkIn: addDays(today, 6), checkOut: addDays(today, 10), channel: "Directo", totalPrice: 430, source: "MANUAL" },
    { propertyIdx: 2, checkIn: addDays(today, 5), checkOut: addDays(today, 8), channel: "Booking.com", totalPrice: 495, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2008" },
    { propertyIdx: 3, checkIn: addDays(today, 2), checkOut: addDays(today, 6), channel: "Airbnb", totalPrice: 460, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2009" },
    { propertyIdx: 6, checkIn: addDays(today, 8), checkOut: addDays(today, 15), channel: "VRBO / Expedia", totalPrice: 1610, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2010" },

    // Reserva ya ajustada a mano — el sync de Lodgify NUNCA debe sobrescribirla
    {
      propertyIdx: 4,
      checkIn: addDays(today, 3),
      checkOut: addDays(today, 6),
      channel: "Booking.com",
      totalPrice: 520,
      source: "LODGIFY",
      lodgifyBookingId: "lodgify-bk-2011",
      manuallyAdjusted: true,
      overridePlatformPct: 18,
      overrideBankPct: 1.8,
    },

    // Pasadas (para histórico / informes)
    { propertyIdx: 5, checkIn: subDays(today, 10), checkOut: subDays(today, 7), channel: "Airbnb", totalPrice: 210, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2012" },
    { propertyIdx: 0, checkIn: subDays(today, 14), checkOut: subDays(today, 9), channel: "Directo", totalPrice: 720, source: "MANUAL" },
    { propertyIdx: 2, checkIn: subDays(today, 9), checkOut: subDays(today, 5), channel: "Booking.com", totalPrice: 560, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2013" },
    { propertyIdx: 6, checkIn: subDays(today, 20), checkOut: subDays(today, 13), channel: "Lodgify", totalPrice: 1380, source: "LODGIFY", lodgifyBookingId: "lodgify-bk-2014" },
  ];

  const defaultPlatformPct = 15;
  const defaultBankPct = 2.5;

  const createdBookings = [];
  for (const b of bookingSeeds) {
    const property = properties[b.propertyIdx];
    const platformPct = b.overridePlatformPct ?? defaultPlatformPct;
    const bankPct = b.overrideBankPct ?? defaultBankPct;
    const { platformCommissionAmt, bankCommissionAmt, netAmount } = calculateCommissions({
      totalPrice: b.totalPrice,
      platformCommissionPct: platformPct,
      bankCommissionPct: bankPct,
    });

    const booking = await prisma.booking.create({
      data: {
        organizationId: org.id,
        propertyId: property.id,
        lodgifyBookingId: b.lodgifyBookingId,
        guestName: nextGuest(),
        guestEmail: null,
        adults: 2,
        children: Math.random() > 0.7 ? 1 : 0,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        channel: b.channel,
        status: "CONFIRMED",
        totalPrice: b.totalPrice,
        platformCommissionPct: platformPct,
        platformCommissionAmt,
        bankCommissionPct: bankPct,
        bankCommissionAmt,
        netAmount,
        manuallyAdjusted: b.manuallyAdjusted ?? false,
        source: b.source,
      },
    });
    createdBookings.push(booking);
  }

  // ---------------------------------------------------------------------
  // Tareas de limpieza / mantenimiento — registro único compartido entre
  // ambos negocios (operativa de Emma + facturación de Aires Majoreros)
  // ---------------------------------------------------------------------
  let empIdx = 0;
  function nextCleaner() {
    const cleaners = employees.filter((e) => e.role === "CLEANING" || e.role === "BOTH");
    const e = cleaners[empIdx % cleaners.length];
    empIdx++;
    return e;
  }

  const doneUnbilledTasks: string[] = [];

  for (const booking of createdBookings) {
    const property = properties.findIndex((p) => p.id === booking.propertyId);
    const prop = properties[property];
    const isPast = booking.checkOut < today;
    const isTodayOrPast = booking.checkOut <= addDays(today, 0);
    let status: string = "PENDING";
    if (isPast) status = "DONE";
    else if (booking.checkOut.toDateString() === today.toDateString()) status = "IN_PROGRESS";

    const assignEmployee = status !== "PENDING" || Math.random() > 0.4;

    const task = await prisma.cleaningTask.create({
      data: {
        organizationId: org.id,
        propertyId: booking.propertyId,
        bookingId: booking.id,
        type: "CLEANING",
        date: booking.checkOut,
        status,
        employeeId: assignEmployee ? nextCleaner().id : null,
        billable: true,
        price: prop.cleaningPrice,
      },
    });

    if (status === "DONE") doneUnbilledTasks.push(task.id);
  }

  // Un par de tareas de mantenimiento (no facturables)
  await prisma.cleaningTask.create({
    data: {
      organizationId: org.id,
      propertyId: properties[3].id,
      type: "MAINTENANCE",
      date: addDays(today, 2),
      status: "PENDING",
      employeeId: employees.find((e) => e.role === "MAINTENANCE")?.id,
      billable: false,
      price: 0,
      notes: "Revisar aire acondicionado del salón",
    },
  });
  await prisma.cleaningTask.create({
    data: {
      organizationId: org.id,
      propertyId: properties[6].id,
      type: "MAINTENANCE",
      date: subDays(today, 1),
      status: "DONE",
      employeeId: employees.find((e) => e.role === "MAINTENANCE")?.id,
      billable: false,
      price: 0,
      notes: "Cambio de bombilla y ajuste de puerta corredera",
    },
  });

  // ---------------------------------------------------------------------
  // Una factura histórica ya emitida (para el historial de Aires Majoreros)
  // ---------------------------------------------------------------------
  const oldPeriodStart = subDays(today, 40);
  const oldPeriodEnd = subDays(today, 33);

  const oldTask1 = await prisma.cleaningTask.create({
    data: {
      organizationId: org.id,
      propertyId: properties[0].id,
      type: "CLEANING",
      date: subDays(today, 38),
      status: "DONE",
      employeeId: employees[0].id,
      billable: true,
      price: properties[0].cleaningPrice,
    },
  });
  const oldTask2 = await prisma.cleaningTask.create({
    data: {
      organizationId: org.id,
      propertyId: properties[2].id,
      type: "CLEANING",
      date: subDays(today, 35),
      status: "DONE",
      employeeId: employees[1].id,
      billable: true,
      price: properties[2].cleaningPrice,
    },
  });

  const oldSubtotal = Number(oldTask1.price) + Number(oldTask2.price);
  const invoice = await prisma.invoice.create({
    data: {
      organizationId: org.id,
      invoiceNumber: `AM-${format(oldPeriodStart, "yyyy")}-0001`,
      billedToName: rentalBusiness.legalName ?? rentalBusiness.name,
      billedToTaxId: rentalBusiness.taxId,
      periodStart: oldPeriodStart,
      periodEnd: oldPeriodEnd,
      issueDate: subDays(today, 32),
      status: "PAID",
      subtotal: oldSubtotal,
      total: oldSubtotal,
      partnerAId: partnerA.id,
      partnerBId: partnerB.id,
      partnerAPercent: 50,
      partnerBPercent: 50,
      partnerAAmount: oldSubtotal / 2,
      partnerBAmount: oldSubtotal / 2,
    },
  });

  await prisma.cleaningTask.update({ where: { id: oldTask1.id }, data: { invoiceId: invoice.id } });
  await prisma.cleaningTask.update({ where: { id: oldTask2.id }, data: { invoiceId: invoice.id } });

  await prisma.invoiceLine.createMany({
    data: [
      {
        invoiceId: invoice.id,
        cleaningTaskId: oldTask1.id,
        description: "Limpieza de salida",
        propertyName: properties[0].name,
        date: oldTask1.date,
        amount: oldTask1.price,
      },
      {
        invoiceId: invoice.id,
        cleaningTaskId: oldTask2.id,
        description: "Limpieza de salida",
        propertyName: properties[2].name,
        date: oldTask2.date,
        amount: oldTask2.price,
      },
    ],
  });

  console.log("✅ Seed completado.");
  console.log(`   Organización: ${org.name}`);
  console.log(`   Viviendas: ${properties.length}`);
  console.log(`   Reservas: ${createdBookings.length}`);
  console.log(`   Tareas de limpieza/mantenimiento pendientes de facturar: ${doneUnbilledTasks.length}`);
  console.log("   Usuarios demo (contraseña 'demo1234'): emma@example.com, socia1@example.com, socia2@example.com, admin@example.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
