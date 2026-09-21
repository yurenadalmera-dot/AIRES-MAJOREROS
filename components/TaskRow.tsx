"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignEmployeeToTask, updateTaskStatus, deleteTask } from "@/lib/actions/tasks";
import { TASK_STATUS_LABEL } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/money";
import { IconoLimpieza, IconoMantenimiento } from "@/components/iconos";
import { Badge } from "@/components/ui";

interface TaskRowProps {
  task: {
    id: string;
    type: string;
    date: string;
    status: string;
    billable: boolean;
    price: number;
    invoiced: boolean;
    notes: string | null;
    employeeId: string | null;
    propertyName: string;
    /** salida | repaso, solo en las limpiezas. */
    servicio: string | null;
    /** Con cuántos huéspedes se calculó el precio. */
    huespedes: number | null;
  };
  employees: { id: string; name: string }[];
}

export default function TaskRow({ task, employees }: TaskRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleAssign(employeeId: string) {
    startTransition(async () => {
      await assignEmployeeToTask(task.id, employeeId || null);
      router.refresh();
    });
  }

  function handleStatus(status: string) {
    startTransition(async () => {
      await updateTaskStatus(task.id, status);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("¿Eliminar esta tarea?")) return;
    startTransition(async () => {
      await deleteTask(task.id);
      router.refresh();
    });
  }

  return (
    <tr className={pending ? "opacity-50" : ""}>
      <td>{formatDate(task.date)}</td>
      <td className="font-medium text-tinta">{task.propertyName}</td>
      <td>
        <span className="inline-flex items-center gap-2">
          {task.type === "CLEANING" ? (
            <IconoLimpieza size={16} className="text-oceano" />
          ) : (
            <IconoMantenimiento size={16} className="text-tinta-suave" />
          )}
          {task.type === "CLEANING"
            ? task.servicio === "repaso"
              ? "Repaso"
              : "Salida"
            : "Mantenimiento"}
        </span>
      </td>
      {/* El dato con el que se cobra: la tarifa es base + tanto por huésped
          que pase de los incluidos. Sin él no se puede comprobar la factura. */}
      <td className="num">
        {task.type === "CLEANING" ? (
          task.huespedes !== null ? (
            task.huespedes
          ) : (
            <span className="text-tinta-suave" title="No consta cuánta gente se iba">
              —
            </span>
          )
        ) : (
          <span className="text-tinta-suave">—</span>
        )}
      </td>
      <td>
        <select
          value={task.status}
          onChange={(e) => handleStatus(e.target.value)}
          disabled={pending}
          className="input py-1 text-xs"
        >
          {Object.entries(TASK_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          value={task.employeeId ?? ""}
          onChange={(e) => handleAssign(e.target.value)}
          disabled={pending}
          className="input py-1 text-xs"
        >
          <option value="">Sin asignar</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </td>
      <td className="num">
        {!task.billable ? (
          <span className="text-tinta-suave">—</span>
        ) : task.price === 0 ? (
          // Una limpieza a 0 € no se puede cobrar. Antes entraba así y no se
          // notaba hasta la factura; ahora se ve en la propia fila.
          <Badge tono="aviso">sin precio</Badge>
        ) : (
          <span className={task.invoiced ? "text-tinta-suave" : "text-tinta"}>
            {formatCurrency(task.price)}
            {task.invoiced ? " · facturada" : ""}
          </span>
        )}
      </td>
      <td className="text-xs text-tinta-suave max-w-[160px] truncate" title={task.notes ?? ""}>
        {task.notes ?? ""}
      </td>
      <td>
        {!task.invoiced && (
          <button
            onClick={handleDelete}
            disabled={pending}
            className="text-xs font-medium text-mal hover:underline disabled:opacity-50"
          >
            Eliminar
          </button>
        )}
      </td>
    </tr>
  );
}
